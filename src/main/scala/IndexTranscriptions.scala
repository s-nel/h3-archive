package com.snacktrace.archive

import akka.actor.ActorSystem
import cats.implicits._
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl.{get => getDoc, _}
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import io.circe.generic.extras.auto._
import io.circe.parser.decode
import akka.stream.Materializer
import com.snacktrace.archive.IndexPodcast.eventsIndex
import com.snacktrace.archive.Server.{EventDoc, TranscriptionDoc, settings}
import com.snacktrace.archive.model.LinkType
import com.typesafe.config.ConfigFactory
import io.circe.generic.extras.Configuration
import io.circe.syntax._

import java.io.File
import java.nio.file.Files
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future, blocking}
import scala.sys.process._
import scala.util.{Failure, Success}

object IndexTranscriptions {
  implicit val system: ActorSystem = ActorSystem()
  implicit val materializer: Materializer = Materializer.createMaterializer(system)
  implicit val circeConfig: Configuration = Configuration.default.withSnakeCaseMemberNames

  def main(args: Array[String]): Unit = {
    val settings = Settings(ConfigFactory.load())
    implicit val dispatcher: ExecutionContext = system.dispatcher

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

    val fut = for {
      hits <- elasticsearchClient.execute {
        search(eventsIndex).size(1000)
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
      filteredEvents = esEvents
        .filter(_.transcription.isEmpty)
        .filter(_.links.exists(_.`type` === LinkType.YouTube.name))
        .sortBy(e => e.startDate)
      paralleEc = ExecutionContext.fromExecutorService(new java.util.concurrent.ForkJoinPool(6))
      _ <- filteredEvents.map(ev => transcribe(elasticsearchClient, settings)(ev)(paralleEc)).sequence
    } yield ()
    Await.result(fut, 60.hours)
  }

  def transcribe(elasticClient: ElasticClient, settings: Settings)(esEvent: EventDoc)(implicit
      ec: ExecutionContext
  ): Future[Unit] = {
    val mp3FileOutput = Files.createTempFile(esEvent.eventId, ".mp3")
    mp3FileOutput.toFile.delete()
    val jsonFileOutput = Files.createTempFile(esEvent.eventId, ".json")
    jsonFileOutput.toFile.delete()
    for {
      _ <- Future {
        blocking {
          println(s"Outputting mp3 to ${mp3FileOutput.toFile.getAbsolutePath}")
          println(s"Outputting json to ${jsonFileOutput.toFile.getAbsolutePath}")
          val ytLink = esEvent.links
            .find(_.`type` === LinkType.YouTube.name)
            .get
            .url
          //val ytLink = "https://youtu.be/A3C6_xE_e0I"
          val command =
            s"""${settings.transcription.get.bin.get} ${ytLink} ${mp3FileOutput.toFile.getAbsolutePath} ${jsonFileOutput.toFile.getAbsolutePath}"""
          println(s"Executing command:\n${command}")
          Process(command).!
        }
      }
      transcriptionDoc <- Future {
        val contents = scala.io.Source.fromFile(jsonFileOutput.toFile).getLines().mkString("\n")
        decode[TranscriptionDoc](contents) match {
          case Left(err) => throw new Exception(s"Unable to decode json ${err}")
          case Right(a)  => a
        }
      }
      updatedDoc = esEvent.copy(
        transcription = Some(transcriptionDoc)
      )
      _ = println(updatedDoc)
      _ <- elasticClient
        .execute {
          indexInto(eventsIndex).withId(updatedDoc.eventId).doc(updatedDoc.asJson.toString())
        }
        .map(_ => ())
    } yield ()
  }
}
