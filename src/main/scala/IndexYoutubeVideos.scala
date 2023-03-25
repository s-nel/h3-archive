package com.snacktrace.archive

import IndexPodcast._

import akka.actor.ActorSystem
import akka.http.scaladsl.model.Uri.{Path, Query}
import akka.http.scaladsl.model.{HttpMethods, HttpRequest, Uri}
import akka.stream.Materializer
import cats.implicits._
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import com.snacktrace.archive.model.{Category, Event, EventId, Link, LinkType, Tag, Thumb}
import com.typesafe.config.ConfigFactory
import io.circe.generic.extras.auto._
import io.circe.generic.extras.Configuration
import io.circe.syntax._

import java.net.URI
import java.time.Instant
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._

object IndexYoutubeVideos {
  implicit val system: ActorSystem = ActorSystem()
  implicit val dispatcher: ExecutionContext = system.dispatcher
  implicit val materializer: Materializer = Materializer.createMaterializer(system)
  implicit val circeConfig: Configuration = Configuration.default

  val youtubeDataApiUrl = Uri("https://www.googleapis.com")
  val h3h3productionsUploadsPlaylistId = "UUDWIvJwLJsE4LG1Atne2blQ"

  def main(args: Array[String]): Unit = {
    val settings = Settings(ConfigFactory.load())

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
            "playlistId" -> h3h3productionsUploadsPlaylistId,
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
            "playlistId" -> h3h3productionsUploadsPlaylistId,
            "key" -> settings.youTube.apiKey,
            "part" -> "snippet",
            "pageToken" -> pageToken,
            "maxResults" -> "50"
          )
        )
    )

    def recurseIndexVideos(request: HttpRequest): Future[Unit] = {
      println(s"Fetching videos [${request.uri.toString()}]")
      for {
        videos <- httpRequest[PlaylistItemsResponse](request)
        events = videos.items.map(toDomain)
        _ <- events.map { event =>
          elasticsearchClient.execute {
            indexInto(eventsIndex).id(event.id.value).doc(toDoc(event).asJson.toString())
          }
        }.sequence
        _ <- videos.nextPageToken.toList
          .map(next => recurseIndexVideos(listVideosRequestByPage(next)))
          .sequence
      } yield ()
    }

    Await.result(recurseIndexVideos(listVideosRequest), 1.minute)
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
