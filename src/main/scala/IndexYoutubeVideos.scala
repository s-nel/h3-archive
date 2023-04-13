package com.snacktrace.archive

import IndexPodcast._

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.{
  HttpCharset,
  HttpCharsets,
  HttpEntity,
  HttpMethods,
  HttpRequest,
  HttpResponse,
  MediaTypes,
  StatusCodes,
  Uri
}
import akka.http.scaladsl.server.Directives._
import cats.implicits._
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl.{get => getDoc, _}
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import com.snacktrace.archive.model.{Category, Event, EventId, Link, LinkType, Tag, Thumb}
import de.heikoseeberger.akkahttpcirce.FailFastCirceSupport
import io.circe.generic.extras.Configuration
import io.circe.generic.extras.auto._
import io.circe.parser.decode
import io.circe.syntax._

import java.io.FileWriter
import java.util.Scanner
import scala.io.StdIn
//import IndexPodcast._

import akka.http.scaladsl.coding.Coders
import akka.http.scaladsl.model.HttpEntity.ChunkStreamPart
import akka.http.scaladsl.model.Uri.{Path, Query}
import akka.http.scaladsl.model.headers.{HttpCookie, `Set-Cookie`}
import akka.http.scaladsl.server.Directive1
import akka.stream.Materializer
import akka.stream.scaladsl.Source
import com.redfin.sitemapgenerator.{ChangeFreq, GoogleMobileSitemapUrl, WebSitemapGenerator, WebSitemapUrl}
import com.tersesystems.echopraxia.plusscala._
import com.sksamuel.elastic4s.requests.searches.queries.RawQuery
import com.snacktrace.archive.Server.EventDoc
import com.snacktrace.archive.Settings.{ElasticsearchSettings, SessionSettings}
import com.typesafe.config.ConfigFactory
import io.circe.Json
import pdi.jwt.{Jwt, JwtAlgorithm}

import java.io.File
import java.net.{URI, URLEncoder}
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.time.{Instant, Duration => JavaDuration}
import java.util.Date
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future, Promise}
import scala.util.{Failure, Success}

object IndexYoutubeVideos {
  implicit val system: ActorSystem = ActorSystem()
  implicit val dispatcher: ExecutionContext = system.dispatcher
  implicit val materializer: Materializer = Materializer.createMaterializer(system)
  //implicit val circeConfig: Configuration = Configuration.default
  //implicit val circeConfigSnakeCase: Configuration = Configuration.default.withSnakeCaseMemberNames

  val youtubeDataApiUrl = Uri("https://www.googleapis.com")
  val h3h3productionsUploadsPlaylistId = "UUDWIvJwLJsE4LG1Atne2blQ"
  val h3podcastChannelId = "UCLtREJY21xRfCuEKvdki1Kw"
  val h3podcastUploadsPlaylistId = "UULtREJY21xRfCuEKvdki1Kw"
  val ignoreFile = new File("youtube.ignore.txt")

  def main(args: Array[String]): Unit = {
    val settings = Settings(ConfigFactory.load())
    val ignoreListWriter = new FileWriter(ignoreFile, true)

    val elasticsearchClient = ElasticClient(
      AkkaHttpClient(
        AkkaHttpClientSettings.default.copy(
          https = true,
          hosts = Vector(settings.elasticsearch.host),
          username = Some(settings.elasticsearch.writeUser),
          password = Some(settings.elasticsearch.writePassword)
        )
      )
    )

    val listVideosRequest = HttpRequest(
      method = HttpMethods.GET,
      uri = youtubeDataApiUrl
        .withPath(Path.Empty / "youtube" / "v3" / "playlistItems")
        .withQuery(
          Query(
            "playlistId" -> h3podcastUploadsPlaylistId,
            "key" -> settings.youTube.apiKey,
            "part" -> "snippet",
            "maxResults" -> "50"
          )
        )
    )

    def listVideosRequestByPage(pageToken: String) = HttpRequest(
      method = HttpMethods.GET,
      uri = youtubeDataApiUrl
        .withPath(Path.Empty / "youtube" / "v3" / "playlistItems")
        .withQuery(
          Query(
            "playlistId" -> h3podcastUploadsPlaylistId,
            "key" -> settings.youTube.apiKey,
            "part" -> "snippet",
            "pageToken" -> pageToken,
            "maxResults" -> "50"
          )
        )
    )

    def recurseIndexVideos(
        esEvents: List[EventDoc],
        youtubeIgnoreList: Set[String],
        request: HttpRequest
    ): Future[Unit] = {
      println(s"Fetching videos [${request.uri.toString()}]")
      for {
        videos <- {
          implicit val circeConfig: Configuration = Configuration.default
          httpRequest[PlaylistItemsResponse](request)
        }
        events = videos.items.map(toDomain)
        _ <- events.traverse { youTubeEvent =>
          val youTubeEventDoc = toDoc(youTubeEvent)
          if (
            esEvents
              .exists(esEvent => esEvent.thumb == youTubeEventDoc.thumb) || youtubeIgnoreList(youTubeEventDoc.name)
          ) {
            Future.successful(())
          } else {
            val foundEvent = esEvents.find(esEvent => esEvent.name == youTubeEvent.name)
            //          val foundEvent = foundEvent1.orElse(
            //            esEvents.find(esEvent =>
            //              Math.abs(esEvent.startDate - event.startDate.toEpochMilli) < (1000L * 60L * 60L * 24L * 2L)
            //            )
            //          )
            foundEvent match {
              case None =>
                println(s"\n\n\n\nYOUTUBE VIDEO: ${youTubeEvent.name}")
                val possibleEvents =
                  esEvents
                    .filter(esEvent =>
                      (esEvent.startDate > youTubeEvent.startDate.toEpochMilli - (2L * 1000L * 60L * 60L * 24L)) && !esEvent.links
                        .exists(_.exists(_.`type` === LinkType.YouTube.name))
                    )
                    .sortBy(_.startDate)
                    .take(5)
                possibleEvents.zipWithIndex.foreach { case (e, i) =>
                  println(s"(${i + 1})  ${e.name}")
                }
                val chosenChr = StdIn.readChar()
                println(s"Chose ${chosenChr}")
                for {
                  _ <-
                    if (chosenChr === '0') {
                      println("Skipping")
                      Future.successful(())
                    } else if (chosenChr === 'i') {
                      println("Ignoring")
                      Future {
                        ignoreListWriter.write(s"${youTubeEventDoc.name}\n")
                        ignoreListWriter.flush()
                      }
                    } else {
                      val chosen = chosenChr - '0'
                      println(s"Chose ${chosenChr}")
                      val foundEvent = possibleEvents.apply(chosen - 1)
                      val updatedDoc = foundEvent.copy(
                        startDate = youTubeEvent.startDate.toEpochMilli,
                        links =
                          Some(foundEvent.links.getOrElse(Set.empty) ++ youTubeEventDoc.links.getOrElse(Set.empty)),
                        thumb = youTubeEventDoc.thumb
                      )
                      println(updatedDoc)
                      Future.successful(())
                      elasticsearchClient
                        .execute {
                          indexInto(eventsIndex).withId(updatedDoc.eventId).doc(updatedDoc.asJson.toString())
                        }
                        .map(_ => ())
                    }
                } yield {}
              case Some(foundEvent) =>
                if (!foundEvent.links.exists(_.exists(_.`type` == LinkType.YouTube.name))) {
                  //implicit val config: Configuration = Configuration.default.withSnakeCaseMemberNames
                  println(
                    s"Found youtube video with same name as Spotify podcast. Updating doc [${foundEvent.eventId}]"
                  )
                  val updatedDoc = foundEvent.copy(
                    startDate = youTubeEvent.startDate.toEpochMilli,
                    links = Some(foundEvent.links.getOrElse(Set.empty) ++ youTubeEventDoc.links.getOrElse(Set.empty)),
                    thumb = youTubeEventDoc.thumb
                  )
                  println(updatedDoc)
                  elasticsearchClient
                    .execute {
                      indexInto(eventsIndex).withId(updatedDoc.eventId).doc(updatedDoc.asJson.toString())
                    }
                    .map(_ => ())
                } else {
                  println("No need to update")
                  Future.successful(())
                }
            }
          }
        }
        _ <- videos.nextPageToken.toList
          .map(next => recurseIndexVideos(esEvents, youtubeIgnoreList, listVideosRequestByPage(next)))
          .sequence
      } yield ()
    }

    val fut = for {
      youtubeIgnoreList <- Future {
        scala.io.Source.fromFile(ignoreFile).getLines().toList
      }
      _ = println(youtubeIgnoreList)
      hits <- elasticsearchClient.execute {
        search(eventsIndex).size(3000).sourceExclude(List("transcription.*"))
      }
      esEvents = hits.result.hits.hits.toList.flatMap { hit =>
        decode[EventDoc](hit.sourceAsString).toTry match {
          case Success(event) =>
            List(event)
          case Failure(exception) =>
            println("Failed to deserialize doc")
            exception.printStackTrace()
            Nil
        }
      }
      _ <- recurseIndexVideos(esEvents, youtubeIgnoreList.toSet, listVideosRequest)
    } yield ()
    Await.result(fut, 60.minute)
  }

  final case class Thumbnail(
      url: String,
      width: Int,
      height: Int
  )

  final case class Thumbnails(
      default: Thumbnail,
      medium: Option[Thumbnail],
      high: Option[Thumbnail],
      standard: Option[Thumbnail],
      maxres: Option[Thumbnail]
  )

  final case class ResourceId(
      videoId: String
  )

  final case class PlaylistItemSnippet(
      publishedAt: String,
      title: String,
      description: String,
      thumbnails: Thumbnails,
      channelTitle: String,
      resourceId: ResourceId
  )

  final case class PlaylistItem(
      id: String,
      snippet: PlaylistItemSnippet
  )

  final case class PlaylistItemsResponse(
      nextPageToken: Option[String],
      items: List[PlaylistItem]
  )

  def toDomain(item: PlaylistItem): Event = {
    Event(
      id = EventId(s"youtube:video:${item.id}"),
      name = item.snippet.title,
      description = "",
      category = Category.Content.Video,
      thumb = Some(Thumb(item.snippet.thumbnails.default.url)),
      children = Set.empty,
      tags = Set(
        Tag("channel", item.snippet.channelTitle)
      ),
      links = Set(
        Link(LinkType.YouTube, URI.create(s"https://youtu.be/${item.snippet.resourceId.videoId}"))
      ),
      startDate = Instant.parse(item.snippet.publishedAt),
      duration = None
    )
  }
}
