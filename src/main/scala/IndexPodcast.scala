package com.snacktrace.archive

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.Uri.{Path, Query}
import akka.http.scaladsl.model.headers.{Authorization, BasicHttpCredentials, OAuth2BearerToken}
import akka.http.scaladsl.model.{FormData, HttpMethods, HttpRequest, Uri}
import akka.stream.Materializer
import cats.implicits._
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.fields.{
  BooleanField,
  DateField,
  DoubleField,
  ElasticField,
  FloatField,
  IntegerField,
  KeywordField,
  LongField,
  NestedField,
  ObjectField,
  TextField
}
import com.snacktrace.archive.model.{Category, EventDoc, LinkDoc, LinkType, PersonRef, TagDoc}
import com.typesafe.config.ConfigFactory
import io.circe.{Decoder, Encoder}
import io.circe.derivation._
import io.circe.syntax._
import io.circe.parser.decode

import java.io.{File, FileWriter}
import java.time.{LocalDate, ZoneId}
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future, blocking}
import scala.util.Using

object IndexPodcast {
  implicit val system: ActorSystem = ActorSystem()
  implicit val dispatcher: ExecutionContext = system.dispatcher
  implicit val materializer: Materializer = Materializer.createMaterializer(system)

  val spotifyAccountsUrl = Uri("https://accounts.spotify.com")
  val spotifyWebApiUrl = Uri("https://api.spotify.com")
  val h3id = "7ydBWzs9BSRh97tsCjOhby"
  val eventsIndex = "events"
  val peopleIndex = "people"
  val soundbitesIndex = "soundbites"
  val steamyIndex = "steamies"
  val pollIndex = "polls"

  final case class Episode(
      description: String,
      htmlDescription: String,
      durationMs: Long,
      href: String,
      id: String,
      name: String,
      release_date: String,
      uri: String,
      externalUrls: ExternalUrls
  )

  object Episode {
    implicit val episodeDecoderInstance: Decoder[Episode] = deriveDecoder(renaming.snakeCase)
    implicit val episodeEncoderInstance: Encoder[Episode] = deriveEncoder(renaming.snakeCase)
  }

  final case class ExternalUrls(spotify: String)

  object ExternalUrls {
    implicit val externalUrlsDecoderInstance: Decoder[ExternalUrls] = deriveDecoder(renaming.snakeCase)
    implicit val externalUrlsEncoderInstance: Encoder[ExternalUrls] = deriveEncoder(renaming.snakeCase)
  }

  final case class Episodes(
      limit: Int,
      next: Option[String],
      offset: Int,
      previous: Option[String],
      total: Int,
      items: List[Episode]
  )

  object Episodes {
    implicit val episodesDecoderInstance: Decoder[Episodes] = deriveDecoder(renaming.snakeCase)
    implicit val episodesEncoderInstance: Encoder[Episodes] = deriveEncoder(renaming.snakeCase)
  }

  final case class TokenResponse(accessToken: String)

  object TokenResponse {
    implicit val tokenResponseDecoderInstance: Decoder[TokenResponse] = deriveDecoder(renaming.snakeCase)
    implicit val tokenResponseEncoderInstance: Encoder[TokenResponse] = deriveEncoder(renaming.snakeCase)
  }

  def main(args: Array[String]): Unit = {
    val settings = Settings.fromConfig(ConfigFactory.load())

    val accessTokenRequest = HttpRequest(
      method = HttpMethods.POST,
      uri = spotifyAccountsUrl.withPath(Path.Empty / "api" / "token"),
      headers = Seq(Authorization(BasicHttpCredentials(settings.spotify.clientId, settings.spotify.clientSecret))),
      entity = FormData("grant_type" -> "client_credentials").toEntity
    )

    def showEpisodesRequest(token: String) =
      HttpRequest(
        method = HttpMethods.GET,
        uri = spotifyWebApiUrl
          .withPath(Path.Empty / "v1" / "shows" / h3id / "episodes")
          .withQuery(Query("market" -> "us")),
        headers = Seq(Authorization(OAuth2BearerToken(token)))
      )

    def showEpisodesRequestByUrl(token: String, url: String) =
      HttpRequest(method = HttpMethods.GET, uri = Uri(url), headers = Seq(Authorization(OAuth2BearerToken(token))))

    def recurseIndexEpisodes(token: TokenResponse, request: HttpRequest): Future[Unit] = {
      println(s"Fetching episodes [${request.uri.toString()}]")
      for {
        episodes <- httpRequest[Episodes](request)
        events = episodes.items.map(toDoc)
        _ <- events.map { eventDoc =>
          val file = new File(s"content/events/${eventDoc.eventId}.json")
          if (file.exists()) {
            println(s"File [${file.getName}] already exists. Skipping")
            Future.successful(())
          } else {
            val allEventPeople = Set(
              PersonRef("eklein", "host"),
              PersonRef("aayad", "crew"),
              PersonRef("cgrant", "crew"),
              PersonRef("dswerdlove", "crew"),
              PersonRef("islater", "crew"),
              PersonRef("layad", "crew"),
              PersonRef("love", "crew"),
              PersonRef("olopes", "crew"),
              PersonRef("stemple", "crew"),
              PersonRef("zlouis", "crew")
            )
            val people = if (eventDoc.name.toLowerCase.contains("leftovers")) {
              allEventPeople ++ Set(PersonRef("hpiker", "host"))
            } else if (eventDoc.name.toLowerCase.contains("after dark")) {
              allEventPeople ++ Set(PersonRef("hklein", "host"))
            } else {
              allEventPeople
            }
            val tags = if (eventDoc.name.toLowerCase.contains("leftovers")) {
              Set(TagDoc("Series", "Leftovers"))
            } else if (eventDoc.name.toLowerCase.contains("after dark")) {
              Set(TagDoc("Series", "After Dark"))
            } else if (eventDoc.name.toLowerCase.contains("h3tv")) {
              Set(TagDoc("Series", "H3TV"))
            } else if (eventDoc.name.toLowerCase.contains("off the rails")) {
              Set(TagDoc("Series", "Off The Rails"))
            } else {
              Set.empty[TagDoc]
            }
            val transformedDoc = eventDoc.copy(people = Some(people), tags = Some(tags))
            Future {
              blocking {
                Using(new FileWriter(file)) { writer =>
                  writer.write(transformedDoc.asJson.spaces2)
                }
                ()
              }
            }
          }
        }.sequence
        _ <- episodes.next.toList
          .map(next => recurseIndexEpisodes(token, showEpisodesRequestByUrl(token.accessToken, next)))
          .sequence
      } yield ()
    }

    val program = for {
      tokenResponse <- httpRequest[TokenResponse](accessTokenRequest)
      episodes <- httpRequest[Episodes](showEpisodesRequest(tokenResponse.accessToken))
      _ = println(s"Found [${Integer.toString(episodes.total)}] episodes")
      _ <- recurseIndexEpisodes(tokenResponse, showEpisodesRequest(tokenResponse.accessToken))
    } yield {}

    Await.result(program, 5.minute)
  }

  def httpRequest[Response: Decoder](request: HttpRequest): Future[Response] = {
    for {
      response <- Http().singleRequest(request)
      entity <- response.entity.toStrict(30.seconds)
      resultE = decode[Response](entity.data.utf8String)
      result <- Future.fromTry(resultE.toTry)
    } yield {
      result
    }
  }

  def toDoc(episode: Episode): EventDoc = {
    EventDoc(
      eventId = episode.uri,
      name = episode.name,
      description = Some(
        episode.htmlDescription.replace(
          "<p>Learn more about your ad choices. Visit <a href=\"https://megaphone.fm/adchoices\" rel=\"nofollow\">megaphone.fm/adchoices</a></p>",
          ""
        )
      ),
      notes = None,
      category = Category.Content.Podcast.name,
      thumb = None,
      tags = None,
      links = Some(Set(LinkDoc(LinkType.Spotify.name, episode.externalUrls.spotify))),
      startDate =
        LocalDate.parse(episode.release_date).atStartOfDay(ZoneId.of("America/Los_Angeles")).toInstant.toEpochMilli,
      duration = Some(episode.durationMs),
      people = None,
      transcription = None
    )
  }

  val eventsMapping = properties(
    KeywordField("event_id"),
    KeywordField("category"),
    TextField("name"),
    TextField("description", analyzer = Some("htmlStripAnalyzer")),
    TextField("notes"),
    KeywordField("thumb"),
    KeywordField("children_ids"),
    NestedField(
      "tags",
      properties = Seq[ElasticField](KeywordField("key"), TextField("value")),
      includeInParent = Some(true)
    ),
    NestedField(
      "links",
      properties = Seq[ElasticField](KeywordField("type"), KeywordField("url")),
      includeInParent = Some(true)
    ),
    DateField("start_date"),
    LongField("duration"),
    NestedField(
      "people",
      properties = Seq[ElasticField](KeywordField("person_id"), KeywordField("role")),
      includeInParent = Some(true)
    ),
    ObjectField(
      "transcription",
      properties = Seq[ElasticField](
        TextField("text"),
        ObjectField(
          "segments",
          enabled = Some(false),
          properties = Seq[ElasticField](
            IntegerField("id"),
            LongField("seek"),
            FloatField("start"),
            FloatField("end"),
            TextField("text"),
            DoubleField("temperature"),
            DoubleField("avg_logprob"),
            DoubleField("compression_ratio"),
            DoubleField("no_speech_prob")
          )
        )
      )
    )
  )

  val peopleIndexMapping = properties(
    KeywordField("person_id"),
    KeywordField("category"),
    TextField("first_name"),
    TextField("last_name"),
    TextField("display_name"),
    TextField("description"),
    TextField("aliases"),
    BooleanField("is_beefing"),
    BooleanField("is_squashed_beef")
  )

  val soundbitesIndexMapping = properties(
    KeywordField("soundbite_id"),
    KeywordField("person_id"),
    TextField("quote"),
    KeywordField("sound_file"),
    TextField("description"),
    IntegerField("winning_year"),
    IntegerField("nominated_year"),
    TextField("alt")
  )

  val steamyIndexMapping = properties(
    KeywordField("steamy_id"),
    NestedField(
      "people",
      properties = Seq[ElasticField](KeywordField("person_id"), TextField("name"), BooleanField("won")),
      includeInParent = Some(true)
    ),
    TextField("name"),
    TextField("description"),
    IntegerField("year")
  )

  val pollIndexMapping =
    properties(KeywordField("poll_id"), TextField("question"), TextField("answer"), BooleanField("ignore_order"))

  val indexSettings: Map[String, Any] = Map(
    "analysis" -> Map[String, Any](
      "analyzer" -> Map[String, Any](
        "htmlStripAnalyzer" -> Map[String, Any](
          "type" -> "custom",
          "tokenizer" -> "standard",
          "filter" -> List("lowercase"),
          "char_filter" -> List("html_strip")
        )
      )
    )
  )
}
