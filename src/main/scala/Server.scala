package com.snacktrace.archive

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.{HttpCharset, HttpCharsets, HttpEntity, HttpResponse, MediaTypes, StatusCodes}
import akka.http.scaladsl.server.Directives._
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl.{get => getDoc, _}
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import com.snacktrace.archive.model.EventId
import de.heikoseeberger.akkahttpcirce.FailFastCirceSupport
import io.circe.generic.extras.Configuration
import io.circe.generic.extras.auto._
import io.circe.parser.decode
import io.circe.syntax._
import IndexPodcast._

import akka.http.scaladsl.coding.Coders
import akka.http.scaladsl.model.HttpEntity.ChunkStreamPart
import akka.http.scaladsl.model.headers.{HttpCookie, `Set-Cookie`}
import akka.http.scaladsl.server.Directive1
import akka.stream.scaladsl.Source
import com.redfin.sitemapgenerator.{ChangeFreq, GoogleMobileSitemapUrl, WebSitemapGenerator, WebSitemapUrl}
import com.tersesystems.echopraxia.plusscala._
import com.sksamuel.elastic4s.requests.searches.queries.RawQuery
import com.snacktrace.archive.Settings.{ElasticsearchSettings, SessionSettings}
import com.typesafe.config.ConfigFactory
import io.circe.Json
import pdi.jwt.{Jwt, JwtAlgorithm}

import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.time.{Duration => JavaDuration}
import java.util.Date
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, Future, Promise}
import scala.util.{Failure, Success}

object Server extends App with FailFastCirceSupport {

  //val pollLogger = LoggerFactory.getLogger("Poll")

  val sessionCookieName = "session"

  val clients = scala.collection.mutable.Map.empty[String, ElasticClient]

  //def main(args: Array[String]): Unit = {
  val settings = Settings(ConfigFactory.load())

  implicit val circeConfig: Configuration = Configuration.default.withSnakeCaseMemberNames
  implicit val system = ActorSystem("my-system")
  implicit val executionContext = system.dispatcher

  val url = "http://h3historian.com"

  @volatile
  var sitemapDir: Option[File] = None

  val readonlyClient = ElasticClient(
    AkkaHttpClient(
      AkkaHttpClientSettings.default.copy(
        https = true,
        hosts = Vector(settings.elasticsearch.host),
        username = Some(settings.elasticsearch.readUser),
        password = Some(settings.elasticsearch.readPassword)
      )
    )
  )
  val readWriteClient = ElasticClient(
    AkkaHttpClient(
      AkkaHttpClientSettings.default.copy(
        https = true,
        hosts = Vector(settings.elasticsearch.host),
        username = Some(settings.elasticsearch.writeUser),
        password = Some(settings.elasticsearch.writePassword)
      )
    )
  )

  val route = {
    pathPrefix("api") {
      pathPrefix("events") {
        get {
          pathPrefix("^.+$".r) { eventId =>
            parameters("with_transcript".optional) { maybeWithTranscript =>
              get {
                complete(getEvent(readonlyClient, eventId, maybeWithTranscript.map(_ == "true").getOrElse(false)))
              }
            }
          } ~
            parameters("q".optional) { maybeQuery =>
              encodeResponseWith(Coders.Gzip) {
                complete(getEvents(readonlyClient, maybeQuery))
              }
            }
        } ~
          post {
            entity(as[Json]) { search =>
              encodeResponseWith(Coders.Gzip) {
                complete(searchEvents(readonlyClient, search))
              }
            }
          } ~
          validateCredentials(settings.session) { client =>
            pathPrefix("^.+$".r) { eventId =>
              entity(as[EventDoc]) { event =>
                put {
                  complete(updateEvent(client, EventId(eventId), event))
                }
              }
            }
          }
      } ~
        pathPrefix("people") {
          get {
            complete(getPeople(readonlyClient, None))
          } ~
            validateCredentials(settings.session) { client =>
              entity(as[PersonDoc]) { person =>
                post {
                  complete(createPerson(client, person))
                } ~
                  pathPrefix("^.+$".r) { personId =>
                    complete(updatePerson(client, personId, person))
                  }
              }
            }
        } ~
        pathPrefix("soundbites") {
          get {
            complete(getSoundbites(readonlyClient))
          } ~
            validateCredentials(settings.session) { client =>
              entity(as[SoundbiteDoc]) { soundbite =>
                pathPrefix("^.+$".r) { soundbiteId =>
                  complete(updateSoundbite(client, soundbiteId, soundbite))
                }
              }
            }
        } ~
        pathPrefix("steamies") {
          get {
            complete(getSteamies(readonlyClient))
          } ~
            put {
              validateCredentials(settings.session) { client =>
                entity(as[SteamyDoc]) { steamy =>
                  pathPrefix("^.+$".r) { steamyId =>
                    complete(updateSteamy(client, steamyId, steamy))
                  }
                }
              }
            }
        } ~
        pathPrefix("auth") {
          pathPrefix("_login") {
            post {
              entity(as[Credentials]) { credentials =>
                complete(authenticate(settings.elasticsearch, settings.session, credentials))
              }
            }
          }
        } ~
        pathPrefix("polls") {
          post {
            entity(as[PollDoc]) { poll =>
              complete(createPoll(readWriteClient, poll))
            }
          } ~
            pathPrefix("^.+$".r) { pollId =>
              get {
                complete(getPoll(readonlyClient, pollId))
              } ~
                pathPrefix("_respond") {
                  post {
                    entity(as[Response]) { response =>
                      extractClientIP { clientIp =>
                        complete(respondToPoll(pollId, clientIp.toString(), response.answer))
                      }
                    }
                  }
                }
            }
        }
    } ~
      path("^((?:mobile_)?sitemap(?:\\d+|_index)?\\.xml)$".r) { sitemapFile =>
        complete(buildSitemap(readonlyClient, sitemapFile))
      }
  }

  val bindingFuture = for {
    _ <- readWriteClient.execute {
      createIndex(peopleIndex).mapping(peopleIndexMapping)
    }
    _ <- readWriteClient.execute {
      createIndex(eventsIndex).mapping(indexMapping)
    }
    _ <- readWriteClient.execute {
      createIndex(soundbitesIndex).mapping(soundbitesIndexMapping)
    }
    _ <- readWriteClient.execute {
      createIndex(steamyIndex).mapping(steamyIndexMapping)
    }
    _ <- readWriteClient.execute {
      createIndex(pollIndex).mapping(pollIndexMapping)
    }
    _ <- readWriteClient.execute {
      putMapping(peopleIndex).properties(peopleIndexMapping.properties)
    }
    _ <- readWriteClient.execute {
      putMapping(eventsIndex).properties(indexMapping.properties)
    }
    _ <- readWriteClient.execute {
      putMapping(soundbitesIndex).properties(soundbitesIndexMapping.properties)
    }
    _ <- readWriteClient.execute {
      putMapping(steamyIndex).properties(steamyIndexMapping.properties)
    }
    _ <- readWriteClient.execute {
      putMapping(pollIndex).properties(pollIndexMapping.properties)
    }
    binding <- Http().newServerAt("localhost", 8080).bind(route)
  } yield {
    binding
  }

  def validateCredentials(sessionSettings: SessionSettings): Directive1[ElasticClient] = {
    cookie(sessionCookieName).flatMap { sessionCookie =>
      val sub = Jwt.decode(sessionCookie.value, sessionSettings.secret, Seq(JwtAlgorithm.HS224)).get.subject.get
      provide(clients.get(sub).get)
    }
  }

  def getEvent(elasticClient: ElasticClient, eventId: String, withTranscript: Boolean): Future[EventDoc] = {
    for {
      hit <- elasticClient.execute {
        getDoc(eventsIndex, eventId)
      }
      decoded <- decode[EventDoc](hit.result.sourceAsString).toTry match {
        case Failure(t) => Future.failed(t)
        case Success(a) => Future.successful(a)
      }
    } yield {
      decoded
    }
  }

  def getEvents(elasticsearchClient: ElasticClient, maybeQueryStr: Option[String]): Future[List[EventDoc]] = {
    val query = maybeQueryStr match {
      case Some(queryStr) if queryStr.trim.nonEmpty =>
        val transformedQueryStr = if (queryStr.matches(".*[a-zA-Z0-9]$")) {
          s"$queryStr*"
        } else {
          queryStr
        }

        queryStringQuery(transformedQueryStr).analyzeWildcard(true)
      case _ => matchAllQuery()
    }

    for {
      hits <- elasticsearchClient.execute {
        search(eventsIndex).query(query).sourceExclude(List("transcription.*")).size(1000)
      }
    } yield {
      val results = hits.result.hits.hits.toList.flatMap { hit =>
        decode[EventDoc](hit.sourceAsString).toTry match {
          case Success(event) =>
            List(event)
          case Failure(exception) =>
            println("Failed to deserialize doc")
            exception.printStackTrace()
            Nil
        }
      }
      results
    }
  }

  def searchEvents(elasticClient: ElasticClient, searchBody: Json): Future[List[EventDoc]] = {
    for {
      hits <- elasticClient.execute {
        search(eventsIndex).query(RawQuery(searchBody.noSpaces)).sourceExclude(List("transcription.*")).size(1000)
      }
    } yield {
      hits.result.hits.hits.toList.flatMap { hit =>
        decode[EventDoc](hit.sourceAsString).toTry match {
          case Success(event) =>
            List(event)
          case Failure(exception) =>
            println("Failed to deserialize doc")
            exception.printStackTrace()
            Nil
        }
      }
    }
  }

  def buildSitemap(elasticClient: ElasticClient, sitemapFileStr: String): Future[HttpResponse] = {
    sitemapDir match {
      case Some(dir)
          if JavaDuration
            .ofMillis(System.currentTimeMillis() - dir.lastModified())
            .compareTo(JavaDuration.ofDays(1)) > 0 =>
        // Delete old sitemaps
        sitemapDir = None
        dir.delete()
        buildSitemap(elasticClient, sitemapFileStr)
      case Some(dir) =>
        val sitemapFile: File = dir.toPath.resolve(sitemapFileStr).toFile
        if (sitemapFile.exists()) {
          Future.successful(
            HttpResponse(entity =
              HttpEntity.fromFile(MediaTypes.`application/xml`.toContentType(HttpCharsets.`UTF-8`), sitemapFile)
            )
          )
        } else {
          Future.successful(HttpResponse(status = StatusCodes.NotFound))
        }
      case _ =>
        val tmpDir = Files.createTempDirectory("h3historian-sitemaps").toFile
        println(s"Writing sitemaps to ${tmpDir.getAbsolutePath}")
        sitemapDir = Some(tmpDir)
        val wsg = WebSitemapGenerator.builder(url, tmpDir).build()
        val mobileWsg = WebSitemapGenerator.builder(url, tmpDir).fileNamePrefix("mobile_sitemap").build()
        List(
          "/",
          "/steamies",
          "/soundbites"
        ).foreach { path =>
          val webSitemapUrl = new WebSitemapUrl(
            new WebSitemapUrl.Options(s"$url$path")
              .lastMod(new Date(System.currentTimeMillis()))
              .changeFreq(ChangeFreq.DAILY)
              .priority(1d)
          )
          wsg.addUrl(webSitemapUrl)
          val mobileUrl = new GoogleMobileSitemapUrl(
            new GoogleMobileSitemapUrl.Options(s"$url$path")
              .lastMod(new Date(System.currentTimeMillis()))
              .changeFreq(ChangeFreq.DAILY)
              .priority(1d)
          )
          mobileWsg.addUrl(mobileUrl)
        }
        for {
          events <- getEvents(readonlyClient, None)
          _ = events.map { event =>
            val webSitemapUrl = new WebSitemapUrl(
              new WebSitemapUrl.Options(s"$url/?event_id=${URLEncoder.encode(event.eventId, StandardCharsets.UTF_8)}")
                .lastMod(new Date(event.startDate))
                .changeFreq(ChangeFreq.MONTHLY)
                .priority(.5d)
            )
            wsg.addUrl(webSitemapUrl)
            val mobileUrl = new GoogleMobileSitemapUrl(
              new GoogleMobileSitemapUrl.Options(s"$url/events/${event.eventId}")
                .lastMod(new Date(event.startDate))
                .changeFreq(ChangeFreq.MONTHLY)
                .priority(.5d)
            )
            mobileWsg.addUrl(mobileUrl)
          }
          people <- getPeople(readonlyClient, None)
          _ = people.map { person =>
            person.personId.foreach { personId =>
              val webSitemapUrl = new WebSitemapUrl(
                new WebSitemapUrl.Options(s"$url/people/$personId")
                  .changeFreq(ChangeFreq.MONTHLY)
                  .priority(.5d)
              )
              wsg.addUrl(webSitemapUrl)
              val mobileUrl = new GoogleMobileSitemapUrl(
                new GoogleMobileSitemapUrl.Options(s"$url/people/$personId")
                  .changeFreq(ChangeFreq.MONTHLY)
                  .priority(.5d)
              )
              mobileWsg.addUrl(mobileUrl)
            }
          }
          _ <- Future(wsg.write())
          _ <- Future(mobileWsg.write())
          _ <- Future(wsg.writeSitemapsWithIndex())
          _ <- Future(mobileWsg.writeSitemapsWithIndex(tmpDir.toPath.resolve("mobile_sitemap_index.xml").toFile))
          response <- buildSitemap(elasticClient, sitemapFileStr)
        } yield {
          response
        }
    }
  }

  def getPeople(elasticsearchClient: ElasticClient, maybeQueryStr: Option[String]): Future[List[PersonDoc]] = {
    val query = maybeQueryStr match {
      case Some(queryStr) if queryStr.trim.nonEmpty =>
        val transformedQueryStr = if (queryStr.matches(".*[a-zA-Z0-9]$")) {
          s"$queryStr*"
        } else {
          queryStr
        }

        queryStringQuery(transformedQueryStr).analyzeWildcard(true)
      case _ => matchAllQuery()
    }

    for {
      hits <- elasticsearchClient.execute {
        search(peopleIndex).query(query).size(1000)
      }
    } yield {
      hits.result.hits.hits.toList.flatMap { hit =>
        decode[PersonDoc](hit.sourceAsString).map(p => p.copy(personId = Some(hit.id))).toTry match {
          case Success(person) =>
            List(person)
          case Failure(exception) =>
            println("Failed to deserialize doc")
            exception.printStackTrace()
            Nil
        }
      }
    }
  }

  def updateEvent(elasticsearchClient: ElasticClient, eventId: EventId, event: EventDoc): Future[Unit] = {
    elasticsearchClient
      .execute {
        indexInto(eventsIndex).withId(eventId.value).doc(event.asJson.toString())
      }
      .map(_ => ())
  }

  def createPerson(elasticClient: ElasticClient, personDoc: PersonDoc): Future[Unit] = {
    elasticClient
      .execute {
        indexInto(peopleIndex).doc(personDoc.asJson.toString)
      }
      .map(_ => ())
  }

  def updatePerson(elasticClient: ElasticClient, id: String, personDoc: PersonDoc): Future[Unit] = {
    elasticClient
      .execute {
        indexInto(peopleIndex).withId(id).doc(personDoc.asJson.toString)
      }
      .map(_ => ())
  }

  def getSoundbites(client: ElasticClient): Future[List[SoundbiteDoc]] = {
    for {
      hits <- client.execute {
        search(soundbitesIndex).size(500)
      }
    } yield {
      hits.result.hits.hits.toList.flatMap { hit =>
        decode[SoundbiteDoc](hit.sourceAsString).map(p => p.copy(soundbiteId = Some(hit.id))).toTry match {
          case Success(soundbite) =>
            List(soundbite)
          case Failure(exception) =>
            println("Failed to deserialize doc")
            exception.printStackTrace()
            Nil
        }
      }
    }
  }

  def getSteamies(client: ElasticClient): Future[List[SteamyDoc]] = {
    for {
      hits <- client.execute {
        search(steamyIndex).size(500)
      }
    } yield {
      hits.result.hits.hits.toList.flatMap { hit =>
        decode[SteamyDoc](hit.sourceAsString).map(p => p.copy(steamyId = Some(hit.id))).toTry match {
          case Success(steamy) =>
            List(steamy)
          case Failure(exception) =>
            println(s"Failed to deserialize steamy doc [${hit.id}]")
            exception.printStackTrace()
            Nil
        }
      }
    }
  }

  def updateSoundbite(client: ElasticClient, id: String, doc: SoundbiteDoc): Future[Unit] = {
    client
      .execute {
        indexInto(soundbitesIndex).withId(id).doc(doc.asJson.toString)
      }
      .map(_ => ())
  }

  def updateSteamy(client: ElasticClient, id: String, doc: SteamyDoc): Future[Unit] = {
    client
      .execute {
        indexInto(steamyIndex).withId(id).doc(doc.asJson.toString)
      }
      .map(_ => ())
  }

  def authenticate(
      esSettings: ElasticsearchSettings,
      sessionSettings: SessionSettings,
      credentials: Credentials
  ): Future[HttpResponse] = {
    val elasticsearchClient = ElasticClient(
      AkkaHttpClient(
        AkkaHttpClientSettings.default.copy(
          https = true,
          hosts = Vector(esSettings.host),
          username = Some(credentials.user),
          password = Some(credentials.password)
        )
      )
    )

    elasticsearchClient
      .execute {
        getUsers()
      }
      .map { _ =>
        clients.put(credentials.user, elasticsearchClient)
        val jwt = Jwt.encode(s"""{"sub": "${credentials.user}"}""", sessionSettings.secret, JwtAlgorithm.HS224)
        HttpResponse(
          status = StatusCodes.OK,
          headers = Seq(`Set-Cookie`(HttpCookie(sessionCookieName, jwt, httpOnly = false, path = Some("/"))))
        )
      }
  }

  def createPoll(elasticsearchClient: ElasticClient, poll: PollDoc): Future[CreatePollResponse] = {
    elasticsearchClient
      .execute {
        indexInto(pollIndex).doc(poll.asJson.toString)
      }
      .map(r => CreatePollResponse(r.result.id))
  }

  def getPoll(elasticsearchClient: ElasticClient, pollId: String): Future[PollWithResponses] = {
    for {
      response <- elasticsearchClient.execute(
        getDoc(pollIndex, pollId)
      )
      pollDoc <- Future.fromTry(decode[PollDoc](response.result.sourceAsString).toTry)
    } yield {
      PollWithResponses(pollDoc.question, pollDoc.answer.map(AnswerResponses(_, 0)))
    }
  }

  def respondToPoll(pollId: String, ip: String, answer: Int): Unit = {
//    pollLogger.info(
//      "poll response",
//      fb => fb.list(fb.string("ip" -> ip), fb.string("poll" -> pollId), fb.number("answer", answer))
//    )
  }

  final case class LinkDoc(
      `type`: String,
      url: String
  )

  final case class TagDoc(
      key: String,
      value: String
  )

  final case class PersonRef(
      personId: String,
      role: String
  )

  final case class EventDoc(
      eventId: String,
      category: String,
      name: String,
      description: String,
      thumb: Option[String],
      tags: Set[TagDoc],
      links: Set[LinkDoc],
      startDate: Long,
      duration: Option[Long],
      people: Option[Set[PersonRef]],
      transcription: Option[TranscriptionDoc]
  )

  final case class TranscriptionDoc(
      text: Option[String],
      segments: Option[List[SegmentDoc]]
  )

  final case class SegmentDoc(
      id: Int,
      seek: Long,
      start: Float,
      end: Float,
      text: String,
      temperature: Double,
      avgLogprob: Double,
      compressionRatio: Double,
      noSpeechProb: Double
  )

  final case class PersonDoc(
      personId: Option[String],
      category: String,
      firstName: String,
      lastName: String,
      displayName: Option[String],
      thumb: Option[String],
      description: Option[String],
      aliases: Option[Set[String]],
      isBeefing: Option[Boolean],
      isSquashedBeef: Option[Boolean]
  )

  final case class SoundbiteDoc(
      soundbiteId: Option[String],
      personId: String,
      quote: Option[String],
      alt: Option[String],
      soundFile: String,
      description: Option[String],
      winningYear: Option[Int],
      nominatedYear: Option[Int]
  )

  final case class SteamyPerson(
      personId: Set[String],
      name: Option[String],
      won: Boolean
  )

  final case class SteamyDoc(
      steamyId: Option[String],
      people: Set[SteamyPerson],
      name: String,
      description: Option[String],
      year: Int
  )

  final case class Credentials(
      user: String,
      password: String
  )

  final case class PollDoc(
      question: String,
      answer: List[String],
      ignoreOrder: Boolean
  )

  final case class CreatePollResponse(
      id: String
  )

  final case class AnswerResponses(
      answer: String,
      responses: Long
  )

  final case class PollWithResponses(
      question: String,
      answers: List[AnswerResponses]
  )

  final case class Response(answer: Int)
}
