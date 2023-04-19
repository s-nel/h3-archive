package com.snacktrace.archive

import model._

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.Uri.{Path, Query}
import akka.http.scaladsl.model.{HttpMethods, HttpRequest, Uri}
import akka.stream.Materializer
import cats.implicits._
import com.typesafe.config.ConfigFactory
import io.circe.derivation.{deriveDecoder, deriveEncoder}
import io.circe.{Decoder, Encoder}
import io.circe.parser.decode
import io.circe.syntax._

import java.io.{File, FileWriter}
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future, blocking}
import scala.io.Source
import scala.util.Using

object IndexYoutubeMetrics {
  implicit val system: ActorSystem = ActorSystem()
  implicit val materializer: Materializer = Materializer.createMaterializer(system)

  val youtubeDataApiUrl = Uri("https://www.googleapis.com")

  def main(args: Array[String]): Unit = {
    val settings = Settings.fromConfig(ConfigFactory.load())

    val batchSize = 25

    def listVideosRequest(ids: List[String]) = HttpRequest(
      method = HttpMethods.GET,
      uri = youtubeDataApiUrl
        .withPath(Path.Empty / "youtube" / "v3" / "videos")
        .withQuery(
          Query(
            "id" -> ids.mkString(","),
            "key" -> settings.youTube.apiKey,
            "part" -> "statistics"
          )
        )
    )

//    def recurseIndexVideos(
//        esEvents: List[EventDoc],
//        youtubeIgnoreList: Set[String],
//        request: HttpRequest
//    ): Future[Unit] = {
//      println(s"Fetching videos [${request.uri.toString()}]")
//      for {
//        videos <- {
//          httpRequest[PlaylistItemsResponse](request)
//        }
//        events = videos.items.map(toDoc)
//        _ <- events.traverse { youTubeEventDoc =>
//          if (esEvents
//              .exists(esEvent => esEvent.thumb == youTubeEventDoc.thumb) || youtubeIgnoreList(youTubeEventDoc.name)) {
//            Future.successful(())
//          } else {
//            val foundEvent = esEvents.find(esEvent => esEvent.name == youTubeEventDoc.name)
//            //          val foundEvent = foundEvent1.orElse(
//            //            esEvents.find(esEvent =>
//            //              Math.abs(esEvent.startDate - event.startDate.toEpochMilli) < (1000L * 60L * 60L * 24L * 2L)
//            //            )
//            //          )
//            foundEvent match {
//              case None =>
//                println(s"\n\n\n\nYOUTUBE VIDEO: ${youTubeEventDoc.name}")
//                val possibleEvents =
//                  esEvents
//                    .filter(
//                      esEvent =>
//                        (esEvent.startDate > youTubeEventDoc.startDate - (2L * 1000L * 60L * 60L * 24L)) && !esEvent.links
//                          .exists(_.exists(_.`type` === LinkType.YouTube.name))
//                    )
//                    .sortBy(_.startDate)
//                    .take(5)
//                possibleEvents.zipWithIndex.foreach {
//                  case (e, i) =>
//                    println(s"(${Integer.toString(i + 1)})  ${e.name}")
//                }
//                val chosenChr = StdIn.readChar()
//                for {
//                  _ <- if (chosenChr === '0') {
//                    println("Skipping")
//                    Future.successful(())
//                  } else if (chosenChr === 'i') {
//                    println("Ignoring")
//                    Future {
//                      ignoreListWriter.write(s"${youTubeEventDoc.name}\n")
//                      ignoreListWriter.flush()
//                    }
//                  } else {
//                    val chosen = chosenChr - '0'
//                    val foundEvent = possibleEvents.apply(chosen - 1)
//                    val updatedDoc = foundEvent.copy(
//                      startDate = youTubeEventDoc.startDate,
//                      links = Some(foundEvent.links.getOrElse(Set.empty) ++ youTubeEventDoc.links.getOrElse(Set.empty)),
//                      thumb = youTubeEventDoc.thumb
//                    )
//                    persistToContent(updatedDoc)
//                  }
//                } yield {}
//              case Some(foundEvent) =>
//                if (!foundEvent.links.exists(_.exists(_.`type` == LinkType.YouTube.name))) {
//                  //implicit val config: Configuration = Configuration.default.withSnakeCaseMemberNames
//                  println(
//                    s"Found youtube video with same name as Spotify podcast. Updating doc [${foundEvent.eventId}]"
//                  )
//                  val updatedDoc = foundEvent.copy(
//                    startDate = youTubeEventDoc.startDate,
//                    links = Some(foundEvent.links.getOrElse(Set.empty) ++ youTubeEventDoc.links.getOrElse(Set.empty)),
//                    thumb = youTubeEventDoc.thumb
//                  )
//                  persistToContent(updatedDoc)
//                } else {
//                  println("No need to update")
//                  Future.successful(())
//                }
//            }
//          }
//        }
//        _ <- videos.nextPageToken.toList
//          .map(next => recurseIndexVideos(esEvents, youtubeIgnoreList, listVideosRequestByPage(next)))
//          .sequence
//      } yield ()
//    }

    val YtUrlRegex = "^https?://.*(?:youtu.be/|v/|u/\\w/|embed/|watch?v=)([^#&?]*).*$".r

    def parseYtUrl(url: String): Option[String] = {
      url match {
        case YtUrlRegex(ytId) =>
          println(s"yt id = ${ytId}")
          Some(ytId)
        case _ => None
      }
    }

    implicit val paralleEc: ExecutionContext =
      ExecutionContext.fromExecutorService(new java.util.concurrent.ForkJoinPool(6))

    val fut = for {
      esEvents <- loadEventsFromContent(true)
      ytEsEvents = esEvents.filter(_.links.exists(_.exists(_.`type` === LinkType.YouTube.name)))
      _ <- ytEsEvents.grouped(batchSize).foldLeft(Future.successful(())) {
        case (fut, batch) =>
          val ytIdToEvent = batch.flatMap { event =>
            event.links
              .flatMap(_.find(_.`type` === LinkType.YouTube.name))
              .flatMap(l => parseYtUrl(l.url))
              .map(ytId => ytId -> event)
          }.toMap
          val request = listVideosRequest(ytIdToEvent.keys.toList)
          for {
            _ <- fut
            response <- httpRequest[VideoListResponse](request)
            _ <- Future.traverse(response.items) { item =>
              ytIdToEvent.get(item.id) match {
                case Some(event) =>
                  val updated = event.copy(
                    metrics = Some(
                      MetricsDoc(item.statistics.viewCount, item.statistics.likeCount, item.statistics.commentCount)
                    )
                  )
                  persistToContent(updated)
                case None =>
                  Future.successful(())
              }
            }
          } yield {}
      }
    } yield ()
    Await.result(fut, 60.minute)
  }

  def loadEventsFromContent(withTranscript: Boolean)(implicit ec: ExecutionContext): Future[List[EventDoc]] = {
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

  def persistToContent(eventDoc: EventDoc)(implicit ec: ExecutionContext): Future[Unit] = {
    val file = new File(s"content/events/${eventDoc.eventId}.json")
    Future(blocking(Using(new FileWriter(file)) { writer =>
      writer.write(eventDoc.asJson.spaces2)
    }))
  }

  def httpRequest[Response: Decoder](request: HttpRequest)(implicit ec: ExecutionContext): Future[Response] = {
    for {
      response <- Http().singleRequest(request)
      entity <- response.entity.toStrict(30.seconds)
      resultE = decode[Response](entity.data.utf8String)
      result <- Future.fromTry(resultE.toTry)
    } yield {
      result
    }
  }

  final case class VideoStatistics(viewCount: Long, likeCount: Long, commentCount: Long)

  object VideoStatistics {
    implicit val videoStatisticsDecoderInstance: Decoder[VideoStatistics] = deriveDecoder
    implicit val videoStatisticsEncoderInstance: Encoder[VideoStatistics] = deriveEncoder
  }

  final case class VideoItem(id: String, statistics: VideoStatistics)

  object VideoItem {
    implicit val videoItemDecoderInstance: Decoder[VideoItem] = deriveDecoder
    implicit val videoItemEncoderInstance: Encoder[VideoItem] = deriveEncoder
  }

  final case class VideoListResponse(items: List[VideoItem])

  object VideoListResponse {
    implicit val videoListResponseDecoderInstance: Decoder[VideoListResponse] = deriveDecoder
    implicit val videoListResponseEncoderInstance: Encoder[VideoListResponse] = deriveEncoder
  }
}
