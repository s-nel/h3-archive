package com.snacktrace.archive

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.{HttpCharsets, HttpEntity, HttpResponse, MediaTypes, StatusCodes}
import akka.http.scaladsl.server.Directives._
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl.{get => getDoc, _}
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import de.heikoseeberger.akkahttpcirce.FailFastCirceSupport
import io.circe.parser.decode
import io.circe.syntax._
import IndexPodcast._

import akka.http.scaladsl.coding.Coders
import akka.http.scaladsl.model.headers.{HttpChallenge, HttpCookie, `Set-Cookie`}
import akka.http.scaladsl.server.{AuthenticationFailedRejection, Directive1}
import com.redfin.sitemapgenerator.{ChangeFreq, GoogleMobileSitemapUrl, WebSitemapGenerator, WebSitemapUrl}
import com.sksamuel.elastic4s.requests.searches.HighlightField
import com.sksamuel.elastic4s.requests.searches.queries.{Query, RawQuery}
import com.sksamuel.elastic4s.requests.searches.sort.{FieldSort, SortOrder}
import com.snacktrace.archive.Settings.{ElasticsearchSettings, SessionSettings}
import com.typesafe.config.ConfigFactory
import io.circe.Json
import model._

import cats.implicits.catsSyntaxEq
import pdi.jwt.{Jwt, JwtAlgorithm}

import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.time.{Duration => JavaDuration}
import java.util.concurrent.atomic.AtomicReference
import java.util.{Date, Locale}
import scala.concurrent.duration._
import scala.concurrent.Future
import scala.util.{Failure, Success}

object Server extends FailFastCirceSupport {
  private val sessionCookieName = "session"

  private val clients: AtomicReference[Map[String, ElasticClient]] =
    new AtomicReference[Map[String, ElasticClient]](Map.empty[String, ElasticClient])

  private val settings = Settings.fromConfig(ConfigFactory.load())

  private implicit val system = ActorSystem("my-system")
  private implicit val executionContext = system.dispatcher

  private val matchAllQueryJson = decode[Json]("""{ "match_all": {} }""")

  private val url = "https://h3historian.com"

  private val sitemapDir: AtomicReference[Option[File]] = new AtomicReference[Option[File]](None)

  private val readonlyClient = ElasticClient(
    AkkaHttpClient(
      AkkaHttpClientSettings.default.copy(
        https = true,
        hosts = Vector(settings.elasticsearch.host),
        username = Some(settings.elasticsearch.readUser),
        password = Some(settings.elasticsearch.readPassword)
      )
    )
  )

  private val readWriteClient = ElasticClient(
    AkkaHttpClient(
      AkkaHttpClientSettings.default.copy(
        https = true,
        hosts = Vector(settings.elasticsearch.host),
        username = Some(settings.elasticsearch.writeUser),
        password = Some(settings.elasticsearch.writePassword)
      )
    )
  )

  private val route = {
    pathPrefix("api") {
      pathPrefix("events") {
        pathPrefix("counts") {
          get {
            complete(getEventCounts(readonlyClient))
          }
        } ~
          get {
            pathPrefix("^.+$".r) { eventId =>
              get {
                complete(getEvent(readonlyClient, eventId))
              }
            } ~
              parameters("q".optional) { maybeQuery =>
                encodeResponseWith(Coders.Gzip) {
                  complete(getEvents(readonlyClient, maybeQuery))
                }
              }
          } ~
          post {
            parameters("person") { personId =>
              entity(as[PartialSearchRequest]) { search =>
                encodeResponseWith(Coders.Gzip) {
                  complete(
                    getPersonEvents(
                      elasticClient = readonlyClient,
                      personId = personId,
                      from = search.from,
                      size = search.size,
                      sort = search.sort
                    )
                  )
                }
              }
            } ~
              entity(as[SearchRequest]) { search =>
                encodeResponseWith(Coders.Gzip) {
                  complete(
                    searchEvents(
                      elasticClient = readonlyClient,
                      searchBody = search.query,
                      from = search.from,
                      size = search.size,
                      sort = search.sort,
                      sourceFiltering =
                        List("transcription", "description", "people", "tags", "links", "thumb", "notes"),
                      highlight = matchAllQueryJson.map(q => search.query != q).getOrElse(true),
                      shards = Some(3)
                    )
                  )
                }
              }
          } ~
          validateCredentials(settings.session) { client =>
            pathPrefix("^.+$".r) { eventId =>
              entity(as[EventDoc]) { event =>
                put {
                  complete(updateEvent(client, eventId, event))
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
        }
    } ~
      path("^((?:mobile_)?sitemap(?:\\d+|_index)?\\.xml)$".r) { sitemapFile =>
        complete(buildSitemap(readonlyClient, sitemapFile))
      }
  }

  private def validateCredentials(sessionSettings: SessionSettings): Directive1[ElasticClient] = {
    val rejection = AuthenticationFailedRejection(
      AuthenticationFailedRejection.CredentialsRejected,
      HttpChallenge(
        scheme = "Basic",
        realm = "Joe Mama Realm"
      )
    )

    cookie(sessionCookieName).flatMap { sessionCookie =>
      Jwt.decode(sessionCookie.value, sessionSettings.secret, Seq(JwtAlgorithm.HS224)) match {
        case Success(decoded) =>
          decoded.subject match {
            case Some(sub) =>
              clients.get().get(sub) match {
                case Some(client) =>
                  provide(client)
                case None =>
                  reject(rejection)
              }
            case None =>
              reject(rejection)
          }
        case Failure(t) =>
          t.printStackTrace()
          reject(rejection)
      }
    }
  }

  private def getEvent(elasticClient: ElasticClient, eventId: String): Future[EventDoc] = {
    for {
      hit <- elasticClient.execute {
        getDoc(eventsIndex, eventId)
      }
      decoded <- Future.fromTry(decode[EventDoc](hit.result.sourceAsString).toTry)
    } yield {
      decoded
    }
  }

  private def getEvents(elasticsearchClient: ElasticClient, maybeQueryStr: Option[String]): Future[List[EventDoc]] = {
    val query: Query = maybeQueryStr match {
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
        search(eventsIndex)
          .query(query)
          .sourceExclude(List("transcription", "description", "duration", "links", "tags"))
          .size(2000)
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

  private def getEventCounts(elasticClient: ElasticClient): Future[Json] = {
    for {
      response <- elasticClient.execute {
        search(eventsIndex)
          .aggs(
            nestedAggregation("pplcount", "people").subAggregations(termsAgg("pplcount2", "people.person_id").size(300))
          )
          .size(0)
      }
      results <- Future.fromTry(decode[Json](response.result.aggregationsAsString).toTry)
    } yield {
      results
    }
  }

  private def getPersonEvents(
      elasticClient: ElasticClient,
      personId: String,
      from: Option[Int],
      size: Option[Int],
      sort: Option[Map[String, String]]
  ): Future[EventsResults] = {
    for {
      searchReq <- Future.fromTry(decode[Json](s"""
           |{
           |  "term": {
           |    "people.person_id": "$personId"
           |  }
           |}
           |""".stripMargin).toTry)
      results <- searchEvents(
        elasticClient,
        searchReq,
        from,
        size,
        sort,
        sourceFiltering = Nil,
        highlight = false,
        shards = Some(2)
      )
    } yield results
  }

  private def searchEvents(
      elasticClient: ElasticClient,
      searchBody: Json,
      from: Option[Int],
      size: Option[Int],
      sort: Option[Map[String, String]],
      sourceFiltering: List[String],
      highlight: Boolean,
      shards: Option[Int]
  ): Future[EventsResults] = {
    val start = System.currentTimeMillis()
    val baseSearch = search(eventsIndex)
      .query(RawQuery(searchBody.noSpaces))
      .sourceExclude(sourceFiltering)
      .size(size.getOrElse(2000))
    val withHighlight = if (highlight) {
      baseSearch.highlighting(
        List(HighlightField("name"), HighlightField("description"), HighlightField("transcription.text"))
      )
    } else {
      baseSearch
    }

    val withFrom = from.map(f => withHighlight.from(f)).getOrElse(withHighlight)
    val withSort = sort
      .map(
        s =>
          withFrom.sortBy(s.map {
            case (k, v) =>
              val order = if (v.toLowerCase(Locale.US) === "asc") {
                SortOrder.ASC
              } else {
                SortOrder.DESC
              }
              FieldSort(field = k, order = order)
          })
      )
      .getOrElse(withFrom.sortBy(FieldSort("_doc")))

    for {
      (hits, totalHits) <- shards match {
        case Some(shards) =>
          Future
            .traverse(0.until(shards).toList) { index =>
              elasticClient.execute(withSort.slice(index, shards).scroll(15.seconds))
            }
            .map { rs =>
              rs.headOption match {
                case Some(head) =>
                  rs.flatMap(_.result.hits.hits.toList) -> head.result.totalHits
                case None =>
                  Nil -> 0L
              }
            }
        case None =>
          elasticClient.execute(withSort).map(r => r.result.hits.hits.toList -> r.result.totalHits)
      }
    } yield {
      println(s"Response from ES took [${(System.currentTimeMillis() - start).toString}]")
      val events = hits.flatMap { hit =>
        decode[EventDoc](hit.sourceAsString).toTry match {
          case Success(event) =>
            List(EventWithHighlight(event, hit.highlight))
          case Failure(exception) =>
            println("Failed to deserialize doc")
            exception.printStackTrace()
            Nil
        }
      }
      println(s"Fetching all events took [${(System.currentTimeMillis() - start).toString}]")
      EventsResults(results = events, total = totalHits)
    }
  }

  @SuppressWarnings(Array("org.wartremover.warts.Recursion"))
  private def buildSitemap(elasticClient: ElasticClient, sitemapFileStr: String): Future[HttpResponse] = {
    sitemapDir.get() match {
      case Some(dir)
          if JavaDuration
            .ofMillis(System.currentTimeMillis() - dir.lastModified())
            .compareTo(JavaDuration.ofDays(1)) > 0 =>
        // Delete old sitemaps
        sitemapDir.set(None)
        val _ = dir.delete()
        buildSitemap(elasticClient, sitemapFileStr)
      case Some(dir) =>
        val sitemapFile: File = dir.toPath.resolve(sitemapFileStr).toFile
        if (sitemapFile.exists()) {
          Future.successful(
            HttpResponse(
              entity =
                HttpEntity.fromFile(MediaTypes.`application/xml`.toContentType(HttpCharsets.`UTF-8`), sitemapFile)
            )
          )
        } else {
          Future.successful(HttpResponse(status = StatusCodes.NotFound))
        }
      case None =>
        val tmpDir = Files.createTempDirectory("h3historian-sitemaps").toFile
        println(s"Writing sitemaps to ${tmpDir.getAbsolutePath}")
        sitemapDir.set(Some(tmpDir))
        val wsg = WebSitemapGenerator.builder(url, tmpDir).build()
        val mobileWsg = WebSitemapGenerator.builder(url, tmpDir).fileNamePrefix("mobile_sitemap").build()
        List("/", "/steamies", "/soundbites").foreach { path =>
          val webSitemapUrl = new WebSitemapUrl(
            new WebSitemapUrl.Options(s"$url$path")
              .lastMod(new Date(System.currentTimeMillis()))
              .changeFreq(ChangeFreq.DAILY)
              .priority(1d)
          )
          val _ = wsg.addUrl(webSitemapUrl)
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
            val _ = wsg.addUrl(webSitemapUrl)
            val mobileUrl = new GoogleMobileSitemapUrl(
              new GoogleMobileSitemapUrl.Options(s"$url/events/${event.eventId}")
                .lastMod(new Date(event.startDate))
                .changeFreq(ChangeFreq.MONTHLY)
                .priority(.5d)
            )
            mobileWsg.addUrl(mobileUrl)
          }
          people <- getPeople(readonlyClient, None)
          _ = people.foreach { person =>
            person.personId.foreach { personId =>
              val webSitemapUrl = new WebSitemapUrl(
                new WebSitemapUrl.Options(s"$url/people/$personId")
                  .changeFreq(ChangeFreq.MONTHLY)
                  .priority(.5d)
              )
              val _ = wsg.addUrl(webSitemapUrl)
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

  private def getPeople(elasticsearchClient: ElasticClient, maybeQueryStr: Option[String]): Future[List[PersonDoc]] = {
    val query: Query = maybeQueryStr match {
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
        search(peopleIndex).query(query).size(2000)
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

  private def updateEvent(elasticsearchClient: ElasticClient, eventId: String, event: EventDoc): Future[Unit] = {
    elasticsearchClient
      .execute {
        indexInto(eventsIndex).withId(eventId).doc(event.asJson.toString())
      }
      .map(_ => ())
  }

  private def createPerson(elasticClient: ElasticClient, personDoc: PersonDoc): Future[Unit] = {
    elasticClient
      .execute {
        indexInto(peopleIndex).doc(personDoc.asJson.toString)
      }
      .map(_ => ())
  }

  private def updatePerson(elasticClient: ElasticClient, id: String, personDoc: PersonDoc): Future[Unit] = {
    elasticClient
      .execute {
        indexInto(peopleIndex).withId(id).doc(personDoc.asJson.toString)
      }
      .map(_ => ())
  }

  private def getSoundbites(client: ElasticClient): Future[List[SoundbiteDoc]] = {
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

  private def getSteamies(client: ElasticClient): Future[List[SteamyDoc]] = {
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

  private def updateSoundbite(client: ElasticClient, id: String, doc: SoundbiteDoc): Future[Unit] = {
    client
      .execute {
        indexInto(soundbitesIndex).withId(id).doc(doc.asJson.toString)
      }
      .map(_ => ())
  }

  private def updateSteamy(client: ElasticClient, id: String, doc: SteamyDoc): Future[Unit] = {
    client
      .execute {
        indexInto(steamyIndex).withId(id).doc(doc.asJson.toString)
      }
      .map(_ => ())
  }

  private def authenticate(
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
        val _ = clients.updateAndGet(_.updated(credentials.user, elasticsearchClient))
        val jwt = Jwt.encode(s"""{"sub": "${credentials.user}"}""", sessionSettings.secret, JwtAlgorithm.HS224)
        HttpResponse(
          status = StatusCodes.OK,
          headers = Seq(`Set-Cookie`(HttpCookie(sessionCookieName, jwt, httpOnly = false, path = Some("/"))))
        )
      }
  }

  def main(args: Array[String]): Unit = {
    for {
      _ <- readWriteClient.execute {
        createIndex(peopleIndex).mapping(peopleIndexMapping)
      }
      _ <- readWriteClient.execute {
        createIndex(eventsIndex).mapping(eventsMapping)
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
        putMapping(eventsIndex).properties(eventsMapping.properties)
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
  }
}
