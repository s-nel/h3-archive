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

import akka.http.scaladsl.server.{PathMatcher, RouteResult}

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
              complete(getEvents(elasticsearchClient, maybeQuery))
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
        putMapping(peopleIndex).properties(peopleIndexMapping.properties)
      }
      _ <- elasticsearchClient.execute {
        putMapping(eventsIndex).properties(indexMapping.properties)
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
        search(peopleIndex).query(query).size(100)
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
      thumb: Option[String],
      description: Option[String],
      aliases: Option[Set[String]],
      isBeefing: Option[Boolean],
      isSquashedBeef: Option[Boolean]
  )
}
