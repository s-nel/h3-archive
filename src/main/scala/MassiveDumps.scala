package com.snacktrace.archive

import akka.actor.ActorSystem
import akka.stream.Materializer
import com.sksamuel.elastic4s.ElasticApi.search
import com.sksamuel.elastic4s.{ElasticClient, Hit, HitReader}
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import com.sksamuel.elastic4s.requests.searches.SearchIterator
import com.snacktrace.archive.IndexPodcast.{eventsIndex, peopleIndex, soundbitesIndex, steamyIndex}
import com.snacktrace.archive.model._
import com.typesafe.config.ConfigFactory
import io.circe.{Decoder, Encoder}
import io.circe.parser.decode
import io.circe.syntax._

import java.io.{File, FileWriter}
import scala.concurrent.{Await, Future}
import scala.concurrent.duration._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.util.{Try, Using}

/**
  * Dump the contents of Elasticsearch indices into the contents directory
  */
object MassiveDumps {
  implicit val system: ActorSystem = ActorSystem()
  implicit val materializer: Materializer = Materializer.createMaterializer(system)
  implicit val timeout = 5.minutes

  def main(args: Array[String]): Unit = {
    val maybeKind = args.lift(0)

    val settings = Settings.fromConfig(ConfigFactory.load())

    val elasticsearchClient = ElasticClient(
      AkkaHttpClient(
        AkkaHttpClientSettings.default.copy(
          https = true,
          hosts = Vector(settings.elasticsearch.host),
          username = Some(settings.elasticsearch.readUser),
          password = Some(settings.elasticsearch.readPassword)
        )
      )
    )

    def dumpEvents(): Future[Unit] = dump[EventDoc](
      client = elasticsearchClient,
      index = eventsIndex,
      dir = "events",
      transformer = e => e.copy(transcription = e.transcription.map(_.copy(text = None))),
      markdownFields = Map.empty
    )
    def dumpPeople(): Future[Unit] = dump[PersonDoc](
      client = elasticsearchClient,
      index = peopleIndex,
      dir = "people",
      transformer = identity,
      markdownFields =
        Map("description" -> (person => person.description.map(d => person.copy(description = None) -> d)))
    )
    def dumpSteamies(): Future[Unit] = dump[SteamyDoc](
      client = elasticsearchClient,
      index = steamyIndex,
      dir = "steamies",
      transformer = identity,
      markdownFields = Map.empty
    )
    def dumpSoundbites(): Future[Unit] = dump[SoundbiteDoc](
      client = elasticsearchClient,
      index = soundbitesIndex,
      dir = "soundbites",
      transformer = identity,
      markdownFields = Map.empty
    )

    val fut = maybeKind match {
      case Some("events") => dumpEvents()
      case Some("people") => dumpPeople()
      case Some("steamies") => dumpSteamies()
      case Some("soundbites") => dumpSoundbites()
      case None =>
        Future.sequence(List(dumpEvents(), dumpPeople(), dumpSteamies(), dumpSoundbites()))
      case Some(other) => Future.failed(new Exception(s"Unsupported kind [$other]"))
    }

    Await.result(fut, Duration.Inf)
  }

  def dump[Doc: Decoder: Encoder](
      client: ElasticClient,
      index: String,
      dir: String,
      transformer: Doc => Doc,
      markdownFields: Map[String, Doc => Option[(Doc, String)]]
  ): Future[Unit] = Future {
    implicit val reader: HitReader[(String, Doc)] = new HitReader[(String, Doc)] {
      override def read(hit: Hit): Try[(String, Doc)] = decode[Doc](hit.sourceAsString).toTry.map(d => hit.id -> d)
    }
    val iterator =
      SearchIterator.iterate[(String, Doc)](client, search(index).matchAllQuery().keepAlive("1m").size(50))
    iterator.foreach {
      case (id, doc) =>
        val updatedDoc = markdownFields.foldLeft(doc) {
          case (doc, (name, markdownF)) =>
            markdownF(doc) match {
              case Some((updatedDoc, markdown)) =>
                val mdFile = new File(s"content/$dir/$id.$name.md")
                println(s"Writing $name markdown to [${mdFile.getAbsolutePath}]")
                Using(new FileWriter(mdFile)) { writer =>
                  writer.write(markdown)
                }
                println(s"Finished writing $name markdown to [${mdFile.getAbsolutePath}]")
                updatedDoc
              case None =>
                doc
            }
          case _ =>
            doc
        }
        val transformedDoc = transformer(updatedDoc)
        val file = new File(s"content/$dir/$id.json")
        println(s"Writing [$id] to [${file.getAbsolutePath}]...")
        Using(new FileWriter(file)) { writer =>
          writer.write(transformedDoc.asJson.spaces2)
        }
        println(s"Finished writing [${id}] to [${file.getAbsolutePath}]")
    }
  }
}
