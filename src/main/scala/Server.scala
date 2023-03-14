package com.snacktrace.archive

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model._
import akka.http.scaladsl.server.Directives._
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl.{get => _, _}
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import com.snacktrace.archive.IndexPodcast.{elasticsearchHost, elasticsearchPassword, elasticsearchUser}
import com.snacktrace.archive.model.{Category, Event, EventId, Link, LinkType, Tag, Thumb}
import de.heikoseeberger.akkahttpcirce.FailFastCirceSupport
import io.circe.generic.extras.Configuration
import io.circe.generic.extras.auto._
import io.circe.parser.decode
import io.circe.syntax._
import IndexPodcast._

import akka.http.scaladsl.coding.Coders
import akka.http.scaladsl.server.{PathMatcher, RouteResult}
import com.sksamuel.elastic4s.requests.searches.queries.RawQuery
import io.circe.Json

import java.net.URI
import java.time.{Duration, Instant}
import scala.concurrent.Future
import scala.io.StdIn
import scala.util.{Failure, Success, Try}

object Server extends FailFastCirceSupport {

  def main(args: Array[String]): Unit = {
    implicit val circeConfig: Configuration = Configuration.default.withSnakeCaseMemberNames
    implicit val system = ActorSystem("my-system")
    implicit val executionContext = system.dispatcher

    val elasticsearchClient = ElasticClient(
      AkkaHttpClient(
        AkkaHttpClientSettings.default.copy(
          https = true,
          hosts = Vector(elasticsearchHost),
          username = Some(elasticsearchUser),
          password = Some(elasticsearchPassword)
        )
      )
    )

    val route = {
      pathPrefix("api") {
        pathPrefix("events") {
          get {
            parameters("q".optional) { maybeQuery =>
              encodeResponseWith(Coders.Gzip) {
                complete(getEvents(elasticsearchClient, maybeQuery))
              }
            }
          } ~
            post {
              entity(as[Json]) { search =>
                encodeResponseWith(Coders.Gzip) {
                  complete(searchEvents(elasticsearchClient, search))
                }
              }
            } ~
            pathPrefix("^.+$".r) { eventId =>
              entity(as[EventDoc]) { event =>
                put {
                  complete(updateEvent(elasticsearchClient, EventId(eventId), event))
                }
              }
            }
        } ~
          pathPrefix("people") {
            get {
              complete(getPeople(elasticsearchClient, None))
            } ~
              entity(as[PersonDoc]) { person =>
                post {
                  complete(createPerson(elasticsearchClient, person))
                } ~
                  pathPrefix("^.+$".r) { personId =>
                    complete(updatePerson(elasticsearchClient, personId, person))
                  }
              }
          } ~
          pathPrefix("soundbites") {
            get {
              complete(getSoundbites(elasticsearchClient))
            } ~
              entity(as[SoundbiteDoc]) { soundbite =>
                pathPrefix("^.+$".r) { soundbiteId =>
                  complete(updateSoundbite(elasticsearchClient, soundbiteId, soundbite))
                }
              }
          }
      }
    }

    val bindingFuture = for {
      _ <- elasticsearchClient.execute {
        createIndex(peopleIndex).mapping(peopleIndexMapping)
      }
      _ <- elasticsearchClient.execute {
        createIndex(eventsIndex).mapping(indexMapping)
      }
      _ <- elasticsearchClient.execute {
        createIndex(soundbitesIndex).mapping(soundbitesIndexMapping)
      }
      _ <- elasticsearchClient.execute {
        putMapping(peopleIndex).properties(peopleIndexMapping.properties)
      }
      _ <- elasticsearchClient.execute {
        putMapping(eventsIndex).properties(indexMapping.properties)
      }
      _ <- elasticsearchClient.execute {
        putMapping(soundbitesIndex).properties(soundbitesIndexMapping.properties)
      }
      binding <- Http().newServerAt("localhost", 8080).bind(route)
    } yield {
      binding
    }

    println(s"Server now online. Please navigate to http://localhost:8080/events\nPress RETURN to stop...")
    StdIn.readLine() // let it run until user presses return
    bindingFuture
      .flatMap(_.unbind()) // trigger unbinding from the port
      .onComplete(_ => system.terminate()) // and shutdown when done
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
        search(peopleIndex).query(query).size(200)
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

  def updateSoundbite(client: ElasticClient, id: String, doc: SoundbiteDoc): Future[Unit] = {
    client
      .execute {
        indexInto(soundbitesIndex).withId(id).doc(doc.asJson.toString)
      }
      .map(_ => ())
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
      quote: String,
      soundFile: String,
      description: Option[String],
      winningYear: Option[Int],
      nominatedYear: Option[Int]
  )
}
