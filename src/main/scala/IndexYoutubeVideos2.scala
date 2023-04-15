package com.snacktrace.archive

import IndexPodcast._

import akka.actor.ActorSystem
import akka.http.scaladsl.model.Uri.{Path, Query}
import akka.http.scaladsl.model.{HttpMethods, HttpRequest, Uri}
import akka.stream.Materializer
import cats.implicits._
import com.snacktrace.archive.model.{EventDoc, LinkDoc, PersonRef, TagDoc}
import com.typesafe.config.ConfigFactory
import io.circe.{Decoder, Encoder}
import io.circe.derivation._

import java.time.Instant
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._

object IndexYoutubeVideos2 {
  implicit val system: ActorSystem = ActorSystem()
  implicit val dispatcher: ExecutionContext = system.dispatcher
  implicit val materializer: Materializer = Materializer.createMaterializer(system)

  val youtubeDataApiUrl = Uri("https://www.googleapis.com")
  val ethanKleinChannelId = "UCUNxEo56DqgAk4hPy40EyKw"
  val ethanKleinPlaylistId = "UUUNxEo56DqgAk4hPy40EyKw"
  val ethanAndHilaChannelId = "UC7pp40MU_6rLK5pvJYG3d0Q"
  val ethanAndHilaPlaylistId = "UU7pp40MU_6rLK5pvJYG3d0Q"

  def main(args: Array[String]): Unit = {
    val settings = Settings.fromConfig(ConfigFactory.load())

    val listVideosRequest = HttpRequest(
      method = HttpMethods.GET,
      uri = youtubeDataApiUrl
        .withPath(Path.Empty / "youtube" / "v3" / "playlistItems")
        .withQuery(
          Query(
            "playlistId" -> ethanAndHilaPlaylistId,
            "key" -> settings.youTube.apiKey,
            "part" -> "snippet",
            "maxResults" -> "50"
          )
        )
    )

    def listVideosRequestByPage(pageToken: String) =
      HttpRequest(
        method = HttpMethods.GET,
        uri = youtubeDataApiUrl
          .withPath(Path.Empty / "youtube" / "v3" / "playlistItems")
          .withQuery(
            Query(
              "playlistId" -> ethanAndHilaPlaylistId,
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
        videos <- {
          httpRequest[PlaylistItemsResponse](request)
        }
        events = videos.items.map(toEventDoc)
        _ <- events.map { event =>
          IndexYoutubeVideos.persistToContent(event)
        }.sequence
        _ <- videos.nextPageToken.toList
          .map(next => recurseIndexVideos(listVideosRequestByPage(next)))
          .sequence
      } yield ()
    }

    Await.result(recurseIndexVideos(listVideosRequest), 1.minute)
  }

  final case class Thumbnail(url: String, width: Int, height: Int)

  object Thumbnail {
    implicit val thumbnailDecoderInstance: Decoder[Thumbnail] = deriveDecoder
    implicit val thumbnailEncoderInstance: Encoder[Thumbnail] = deriveEncoder
  }

  final case class Thumbnails(
      default: Thumbnail,
      medium: Option[Thumbnail],
      high: Option[Thumbnail],
      standard: Option[Thumbnail],
      maxres: Option[Thumbnail]
  )

  object Thumbnails {
    implicit val thumbnailsDecoderInstance: Decoder[Thumbnails] = deriveDecoder
    implicit val thumbnailsEncoderInstance: Encoder[Thumbnails] = deriveEncoder
  }

  final case class ResourceId(videoId: String)

  object ResourceId {
    implicit val resourceIdDecoderInstance: Decoder[ResourceId] = deriveDecoder
    implicit val resourceIdEncoderInstance: Encoder[ResourceId] = deriveEncoder
  }

  final case class PlaylistItemSnippet(
      publishedAt: String,
      title: String,
      description: String,
      thumbnails: Thumbnails,
      channelTitle: String,
      resourceId: ResourceId
  )

  object PlaylistItemSnippet {
    implicit val playlistItemSnippetDecoderInstance: Decoder[PlaylistItemSnippet] = deriveDecoder
    implicit val playlistItemSnippetEncoderInstance: Encoder[PlaylistItemSnippet] = deriveEncoder
  }

  final case class PlaylistItem(id: String, snippet: PlaylistItemSnippet)

  object PlaylistItem {
    implicit val playlistItemDecoderInstance: Decoder[PlaylistItem] = deriveDecoder
    implicit val playlistItemEncoderInstance: Encoder[PlaylistItem] = deriveEncoder
  }

  final case class PlaylistItemsResponse(nextPageToken: Option[String], items: List[PlaylistItem])
  object PlaylistItemsResponse {
    implicit val playlistItemsResponseDecoderInstance: Decoder[PlaylistItemsResponse] = deriveDecoder
    implicit val playlistItemsResponseEncoderInstance: Encoder[PlaylistItemsResponse] = deriveEncoder
  }

  def toEventDoc(item: PlaylistItem): EventDoc = {
    EventDoc(
      eventId = s"youtube:video:${item.id}",
      name = item.snippet.title,
      description = Some(item.snippet.description),
      category = "video",
      thumb = Some(item.snippet.thumbnails.default.url),
      tags = Some(Set(TagDoc("channel", item.snippet.channelTitle))),
      links = Some(Set(LinkDoc("youtube", s"https://youtu.be/${item.snippet.resourceId.videoId}"))),
      startDate = Instant.parse(item.snippet.publishedAt).toEpochMilli,
      duration = None,
      people = Some(Set(PersonRef("eklein", "host"), PersonRef("hklein", "host"))),
      transcription = None
    )
  }
}
