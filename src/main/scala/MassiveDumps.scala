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

    def dumpEvents(): Future[Unit] = dump[EventDoc](elasticsearchClient, eventsIndex, "events")
    def dumpPeople(): Future[Unit] = dump[PersonDoc](elasticsearchClient, peopleIndex, "people")
    def dumpSteamies(): Future[Unit] = dump[SteamyDoc](elasticsearchClient, steamyIndex, "steamies")
    def dumpSoundbites(): Future[Unit] =
      dump[SoundbiteDoc](elasticsearchClient, soundbitesIndex, "soundbites")

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

  def dump[Doc: Decoder: Encoder](client: ElasticClient, index: String, dir: String): Future[Unit] = Future {
    implicit val reader: HitReader[(String, Doc)] = new HitReader[(String, Doc)] {
      override def read(hit: Hit): Try[(String, Doc)] = decode[Doc](hit.sourceAsString).toTry.map(d => hit.id -> d)
    }
    val iterator =
      SearchIterator.iterate[(String, Doc)](client, search(index).matchAllQuery().keepAlive("1m").size(50))
    iterator.foreach {
      case (id, doc) =>
        val file = new File(s"content/$dir/$id.json")
        println(s"Writing [$id] to [${file.getAbsolutePath}]...")
        Using(new FileWriter(file)) { writer =>
          writer.write(doc.asJson.spaces2)
        }
        println(s"Finished writing [${id}] to [${file.getAbsolutePath}]")
    }
  }
}
