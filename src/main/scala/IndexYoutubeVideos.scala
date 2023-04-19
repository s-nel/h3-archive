package com.snacktrace.archive

import IndexPodcast._

import akka.actor.ActorSystem
import akka.http.scaladsl.model.{HttpMethods, HttpRequest, Uri}
import cats.implicits._
import com.snacktrace.archive.IndexYoutubeVideos2._
import com.snacktrace.archive.model.{Category, LinkDoc, LinkType, TagDoc}
import io.circe.syntax._
import io.circe.parser.decode

import java.io.{File, FileWriter}
import scala.io.{Source, StdIn}
import akka.http.scaladsl.model.Uri.{Path, Query}
import akka.stream.Materializer
import com.snacktrace.archive.model.EventDoc
import com.typesafe.config.ConfigFactory

import java.time.Instant
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future, blocking}
import scala.util.Using

object IndexYoutubeVideos {
  implicit val system: ActorSystem = ActorSystem()
  implicit val dispatcher: ExecutionContext = system.dispatcher
  implicit val materializer: Materializer = Materializer.createMaterializer(system)

  val youtubeDataApiUrl = Uri("https://www.googleapis.com")
  val h3h3productionsUploadsPlaylistId = "UUDWIvJwLJsE4LG1Atne2blQ"
  val h3podcastChannelId = "UCLtREJY21xRfCuEKvdki1Kw"
  val h3podcastUploadsPlaylistId = "UULtREJY21xRfCuEKvdki1Kw"
  val ignoreFile = new File("youtube.ignore.txt")

  def main(args: Array[String]): Unit = {
    val settings = Settings.fromConfig(ConfigFactory.load())
    val ignoreListWriter = new FileWriter(ignoreFile, true)

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

    def listVideosRequestByPage(pageToken: String) =
      HttpRequest(
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
          httpRequest[PlaylistItemsResponse](request)
        }
        events = videos.items.map(toDoc)
        _ <- events.traverse { youTubeEventDoc =>
          if (esEvents
              .exists(esEvent => esEvent.thumb == youTubeEventDoc.thumb) || youtubeIgnoreList(youTubeEventDoc.name)) {
            Future.successful(())
          } else {
            val foundEvent = esEvents.find(esEvent => esEvent.name == youTubeEventDoc.name)
            //          val foundEvent = foundEvent1.orElse(
            //            esEvents.find(esEvent =>
            //              Math.abs(esEvent.startDate - event.startDate.toEpochMilli) < (1000L * 60L * 60L * 24L * 2L)
            //            )
            //          )
            foundEvent match {
              case None =>
                println(s"\n\n\n\nYOUTUBE VIDEO: ${youTubeEventDoc.name}")
                val possibleEvents =
                  esEvents
                    .filter(
                      esEvent =>
                        (esEvent.startDate > youTubeEventDoc.startDate - (2L * 1000L * 60L * 60L * 24L)) && !esEvent.links
                          .exists(_.exists(_.`type` === LinkType.YouTube.name))
                    )
                    .sortBy(_.startDate)
                    .take(5)
                possibleEvents.zipWithIndex.foreach {
                  case (e, i) =>
                    println(s"(${Integer.toString(i + 1)})  ${e.name}")
                }
                val chosenChr = StdIn.readChar()
                for {
                  _ <- if (chosenChr === '0') {
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
                    val foundEvent = possibleEvents.apply(chosen - 1)
                    val updatedDoc = foundEvent.copy(
                      startDate = youTubeEventDoc.startDate,
                      links = Some(foundEvent.links.getOrElse(Set.empty) ++ youTubeEventDoc.links.getOrElse(Set.empty)),
                      thumb = youTubeEventDoc.thumb
                    )
                    persistToContent(updatedDoc)
                  }
                } yield {}
              case Some(foundEvent) =>
                if (!foundEvent.links.exists(_.exists(_.`type` == LinkType.YouTube.name))) {
                  //implicit val config: Configuration = Configuration.default.withSnakeCaseMemberNames
                  println(
                    s"Found youtube video with same name as Spotify podcast. Updating doc [${foundEvent.eventId}]"
                  )
                  val updatedDoc = foundEvent.copy(
                    startDate = youTubeEventDoc.startDate,
                    links = Some(foundEvent.links.getOrElse(Set.empty) ++ youTubeEventDoc.links.getOrElse(Set.empty)),
                    thumb = youTubeEventDoc.thumb
                  )
                  persistToContent(updatedDoc)
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
      esEvents <- loadEventsFromContent(false)
      _ <- recurseIndexVideos(esEvents, youtubeIgnoreList.toSet, listVideosRequest)
    } yield ()
    Await.result(fut, 60.minute)
  }

  def loadEventsFromContent(withTranscript: Boolean): Future[List[EventDoc]] = {
    Future.traverse(new File("content/events").listFiles().toList.filter(_.getName.endsWith(".json"))) { file =>
      for {
        text <- Future(blocking(Source.fromFile(file).getLines().mkString("\n")))
        eventDoc <- Future.fromTry(decode[EventDoc](text).toTry)
      } yield
        (
          if (withTranscript) {
            eventDoc
          } else {
            eventDoc.copy(transcription = eventDoc.transcription.map(_.copy(text = None, segments = None)))
          }
        )
    }
  }

  def persistToContent(eventDoc: EventDoc): Future[Unit] = {
    val file = new File(s"content/events/${eventDoc.eventId}.json")
    Future(blocking(Using(new FileWriter(file)) { writer =>
      writer.write(eventDoc.asJson.spaces2)
    }))
  }

  def toDoc(item: PlaylistItem): EventDoc = {
    EventDoc(
      eventId = s"youtube:video:${item.id}",
      name = item.snippet.title,
      description = None,
      notes = None,
      category = Category.Content.Video.name,
      thumb = Some(item.snippet.thumbnails.default.url),
      tags = Some(Set(TagDoc("channel", item.snippet.channelTitle))),
      links = Some(Set(LinkDoc(LinkType.YouTube.name, s"https://youtu.be/${item.snippet.resourceId.videoId}"))),
      startDate = Instant.parse(item.snippet.publishedAt).toEpochMilli,
      duration = None,
      people = None,
      transcription = None,
      metrics = None
    )
  }
}
