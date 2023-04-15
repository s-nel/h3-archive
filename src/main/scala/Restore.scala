package com.snacktrace.archive

import akka.actor.ActorSystem
import akka.stream.Materializer
import cats.implicits.catsSyntaxEq
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import com.sksamuel.elastic4s.requests.common.VersionType
import com.sksamuel.elastic4s.requests.mappings.MappingDefinition
import com.snacktrace.archive.IndexPodcast.{
  eventsIndex,
  eventsMapping,
  peopleIndex,
  peopleIndexMapping,
  soundbitesIndex,
  soundbitesIndexMapping,
  steamyIndex,
  steamyIndexMapping
}
import com.snacktrace.archive.model._
import com.typesafe.config.ConfigFactory
import io.circe.{Decoder, Encoder}
import io.circe.parser.decode
import io.circe.syntax._

import java.io.File
import java.nio.charset.CodingErrorAction
import scala.concurrent.{Await, Future}
import scala.concurrent.duration._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.io.{Codec, Source}
import scala.util.{Failure, Success, Try}

/**
  * Push content from files to Elasticsearch
  */
object Restore {
  implicit val system: ActorSystem = ActorSystem()
  implicit val materializer: Materializer = Materializer.createMaterializer(system)
  implicit val timeout = 5.minutes

  private val ignoreList = Set(".DS_Store")

  def main(args: Array[String]): Unit = {
    val maybeKind = args.lift(0)
    val maybeBatchSize = args.lift(1).flatMap(a => Try(Integer.parseInt(a)).toOption)

    val settings = Settings.fromConfig(ConfigFactory.load())

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

    def restoreEvents(): Future[Unit] = restore[EventDoc](
      client = elasticsearchClient,
      index = eventsIndex,
      mapping = eventsMapping,
      dir = "events",
      maybeBatchSize = maybeBatchSize,
      transformer = eventDoc => {
        eventDoc.copy(transcription = eventDoc.transcription.flatMap { transcription =>
          transcription.segments.map { segments =>
            val fullTextBuilder = new StringBuilder()
            segments.foreach { segment =>
              fullTextBuilder.append(segment.text)
            }
            transcription.copy(text = Some(fullTextBuilder.toString()))
          }
        })
      }
    )

    def restorePeople(): Future[Unit] = restore[PersonDoc](
      client = elasticsearchClient,
      index = peopleIndex,
      mapping = peopleIndexMapping,
      dir = "people",
      maybeBatchSize = maybeBatchSize,
      transformer = identity
    )

    def restoreSteamies(): Future[Unit] = restore[SteamyDoc](
      client = elasticsearchClient,
      index = steamyIndex,
      mapping = steamyIndexMapping,
      dir = "steamies",
      maybeBatchSize = maybeBatchSize,
      transformer = identity
    )

    def restoreSoundbites(): Future[Unit] = restore[SoundbiteDoc](
      client = elasticsearchClient,
      index = soundbitesIndex,
      mapping = soundbitesIndexMapping,
      dir = "soundbites",
      maybeBatchSize = maybeBatchSize,
      transformer = identity
    )

    val fut = maybeKind match {
      case Some("events") => restoreEvents()
      case Some("people") => restorePeople()
      case Some("steamies") => restoreSteamies()
      case Some("soundbites") => restoreSoundbites()
      case None =>
        Future.sequence(List(restoreEvents(), restorePeople(), restoreSteamies(), restoreSoundbites()))
      case Some(other) => Future.failed(new Exception(s"Unsupported kind [$other]"))
    }

    Await.result(fut, Duration.Inf)
  }

  def restore[Doc: Decoder: Encoder](
      client: ElasticClient,
      index: String,
      mapping: MappingDefinition,
      dir: String,
      maybeBatchSize: Option[Int],
      transformer: Doc => Doc
  ): Future[Unit] = {
    for {
      createIndexResponse <- client.execute(createIndex(index).mapping(mapping))
      _ <- createIndexResponse.toEither match {
        case Right(_) => Future.successful(())
        case Left(err) if err.`type` === "resource_already_exists_exception" => Future.successful(())
        case Left(err) => Future.failed(err.asException)
      }
      updateMappingResponse <- client.execute(putMapping(index).properties(mapping.properties))
      _ <- updateMappingResponse.toEither match {
        case Right(a) => Future.successful(a)
        case Left(err) => Future.failed(err.asException)
      }
      ops <- Future.traverse(new File(s"content/$dir").listFiles().toList.filterNot { f =>
        ignoreList(f.getName)
      }) { file =>
        val id = file.getName.substring(0, file.getName.lastIndexOf("."))
        implicit val codec: Codec = Codec.UTF8
        codec.onMalformedInput(CodingErrorAction.REPLACE)
        codec.onUnmappableCharacter(CodingErrorAction.REPLACE)
        for {
          jsonStr <- Try(Source.fromFile(file).getLines().mkString("\n")) match {
            case Success(a) => Future.successful(a)
            case Failure(t) =>
              println(s"Failed reading [${file.getAbsolutePath}]")
              Future.failed(t)
          }
          doc <- Future.fromTry(decode[Doc](jsonStr).toTry match {
            case Success(a) => Success(a)
            case Failure(t) =>
              println(s"Failed decoding [${file.getAbsolutePath}]")
              Failure(t)
          })
        } yield {
          val transformedDoc = transformer(doc)
          indexInto(index)
            .withId(id)
            .doc(transformedDoc.asJson.noSpaces)
            .versionType(VersionType.EXTERNAL)
            .version(file.lastModified())
        }
      }
      batches = ops.grouped(maybeBatchSize.getOrElse(50))
      results <- Future.traverse(batches) { batch =>
        client.execute(bulk(batch: _*))
      }
      successes = results.toList.flatMap(_.result.successes.toList)
      failures = results.toList.flatMap(_.result.failures.toList)
      unchanged = successes.foldLeft(0) {
        case (acc, success) =>
          if (success.status === 409) {
            acc + 1
          } else {
            println(
              s"Successfully pushed doc [${success.id}] to index [${success.index}] with response [${Integer.toString(success.status)}]"
            )
            acc
          }
      }
      _ = if (unchanged > 0) {
        println(s"[${Integer.toString(unchanged)}] docs unchanged")
      } else {
        ()
      }
      _ = failures.foreach { failure =>
        println(
          s"Failed to index doc [${failure.id}] to index [${failure.index}] with response [${Integer.toString(failure.status)}]"
        )
      }
      _ <- if (failures.nonEmpty) {
        Future.failed(new Exception("Some content failed to restore"))
      } else {
        Future.successful(())
      }
    } yield {}
  }
}
