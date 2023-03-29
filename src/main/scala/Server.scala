package com.snacktrace.archive

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.{HttpResponse, StatusCodes}
import akka.http.scaladsl.server.Directives._
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl.{get => _, _}
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import com.snacktrace.archive.model.EventId
import de.heikoseeberger.akkahttpcirce.FailFastCirceSupport
import io.circe.generic.extras.Configuration
import io.circe.generic.extras.auto._
import io.circe.parser.decode
import io.circe.syntax._
import IndexPodcast._

import akka.http.scaladsl.coding.Coders
import akka.http.scaladsl.model.headers.{HttpCookie, `Set-Cookie`}
import akka.http.scaladsl.server.Directive1
import com.sksamuel.elastic4s.requests.searches.queries.RawQuery
import com.snacktrace.archive.Settings.{ElasticsearchSettings, SessionSettings}
import com.typesafe.config.ConfigFactory
import io.circe.Json
import pdi.jwt.{Jwt, JwtAlgorithm}

import scala.concurrent.Future
import scala.io.StdIn
import scala.util.{Failure, Success, Try}

object Server extends FailFastCirceSupport {

  val sessionCookieName = "session"

  val clients = scala.collection.mutable.Map.empty[String, ElasticClient]

  def main(args: Array[String]): Unit = {
    val settings = Settings(ConfigFactory.load())

    implicit val circeConfig: Configuration = Configuration.default.withSnakeCaseMemberNames
    implicit val system = ActorSystem("my-system")
    implicit val executionContext = system.dispatcher

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
          }
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
      binding <- Http().newServerAt("localhost", 8080).bind(route)
    } yield {
      binding
    }

    println(s"Server now online at http://localhost:8080/\nPress RETURN to stop...")
    StdIn.readLine() // let it run until user presses return
    bindingFuture
      .flatMap(_.unbind()) // trigger unbinding from the port
      .onComplete(_ => system.terminate()) // and shutdown when done
  }

  def validateCredentials(sessionSettings: SessionSettings): Directive1[ElasticClient] = {
    cookie(sessionCookieName).flatMap { sessionCookie =>
      val sub = Jwt.decode(sessionCookie.value, sessionSettings.secret, Seq(JwtAlgorithm.HS224)).get.subject.get
      provide(clients.get(sub).get)
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
        search(eventsIndex).query(query).size(1000)
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
        search(eventsIndex).query(RawQuery(searchBody.noSpaces)).size(1000)
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
            println("Failed to deserialize steamy doc")
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
      people: Option[Set[PersonRef]]
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
}
