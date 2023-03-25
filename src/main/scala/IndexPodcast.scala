package com.snacktrace.archive

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.Uri.{Path, Query}
import akka.http.scaladsl.model.headers.{Authorization, BasicHttpCredentials, OAuth2BearerToken}
import akka.http.scaladsl.model.{FormData, HttpMethods, HttpRequest, Uri}
import akka.stream.Materializer
import cats.implicits._
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.akka.{AkkaHttpClient, AkkaHttpClientSettings}
import com.sksamuel.elastic4s.fields.{
  BooleanField,
  DateField,
  IntegerField,
  KeywordField,
  LongField,
  NestedField,
  TextField
}
import com.snacktrace.archive.Server.{EventDoc, LinkDoc, PersonRef, TagDoc}
import com.snacktrace.archive.model._
import com.typesafe.config.ConfigFactory
import io.circe.Decoder
import io.circe.syntax._
import io.circe.generic.extras.Configuration
import io.circe.generic.extras.auto._
import io.circe.parser.decode

import java.net.URI
import java.time.{LocalDate, ZoneId}
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future}

object IndexPodcast {
  implicit val system: ActorSystem = ActorSystem()
  implicit val dispatcher: ExecutionContext = system.dispatcher
  implicit val materializer: Materializer = Materializer.createMaterializer(system)
  implicit val circeConfig: Configuration = Configuration.default.withSnakeCaseMemberNames

  val spotifyAccountsUrl = Uri("https://accounts.spotify.com")
  val spotifyWebApiUrl = Uri("https://api.spotify.com")
  val h3id = "7ydBWzs9BSRh97tsCjOhby"
  val eventsIndex = "events"
  val peopleIndex = "people"
  val soundbitesIndex = "soundbites"

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

  final case class ExternalUrls(
      spotify: String
  )

  final case class Episodes(
      limit: Int,
      next: Option[String],
      offset: Int,
      previous: Option[String],
      total: Int,
      items: List[Episode]
  )

  final case class TokenResponse(
      accessToken: String
  )

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

    val accessTokenRequest = HttpRequest(
      method = HttpMethods.POST,
      uri = spotifyAccountsUrl.withPath(Path.Empty / "api" / "token"),
      headers = Seq(Authorization(BasicHttpCredentials(settings.spotify.clientId, settings.spotify.clientSecret))),
      entity = FormData(
        "grant_type" -> "client_credentials"
      ).toEntity
    )

    def showEpisodesRequest(token: String) = HttpRequest(
      method = HttpMethods.GET,
      uri = spotifyWebApiUrl
        .withPath(Path.Empty / "v1" / "shows" / h3id / "episodes")
        .withQuery(Query("market" -> "us")),
      headers = Seq(Authorization(OAuth2BearerToken(token)))
    )

    def showEpisodesRequestByUrl(token: String, url: String) = HttpRequest(
      method = HttpMethods.GET,
      uri = Uri(url),
      headers = Seq(Authorization(OAuth2BearerToken(token)))
    )

    def recurseIndexEpisodes(token: TokenResponse, request: HttpRequest): Future[Unit] = {
      println(s"Fetching episodes [${request.uri.toString()}]")
      for {
        episodes <- httpRequest[Episodes](request)
        events = episodes.items.map(toDomain)
        _ <- events.map { event =>
          elasticsearchClient.execute {
            val eventDoc = toDoc(event)
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
            val transformedDoc = eventDoc.copy(people = Some(people), tags = tags)
            indexInto(eventsIndex).createOnly(true).id(event.id.value).doc(transformedDoc.asJson.toString())
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
      _ = println(s"Found [${episodes.total}] episodes")
      _ <- elasticsearchClient.execute {
        createIndex(eventsIndex).settings(indexSettings).mapping(indexMapping)
      }
      _ <- recurseIndexEpisodes(tokenResponse, showEpisodesRequest(tokenResponse.accessToken))
    } yield {}

    Await.result(program, 1.minute)
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

  def toDomain(episode: Episode): Event = {
    Event(
      id = EventId(episode.uri),
      name = episode.name,
      description = episode.htmlDescription.replace(
        "<p>Learn more about your ad choices. Visit <a href=\"https://megaphone.fm/adchoices\" rel=\"nofollow\">megaphone.fm/adchoices</a></p>",
        ""
      ),
      category = Category.Content.Podcast,
      thumb = None,
      children = Set.empty,
      tags = Set.empty,
      links = Set(
        Link(LinkType.Spotify, URI.create(episode.externalUrls.spotify))
      ),
      startDate = LocalDate.parse(episode.release_date).atStartOfDay(ZoneId.of("America/Los_Angeles")).toInstant,
      duration = Some(java.time.Duration.ofMillis(episode.durationMs))
    )
  }

  def toDoc(event: Event): EventDoc = {
    EventDoc(
      eventId = event.id.value,
      category = event.category.name,
      name = event.name,
      description = event.description,
      thumb = event.thumb.map(_.value),
      tags = event.tags.map(t => TagDoc(t.key, t.value)),
      links = event.links.map(l => LinkDoc(l.`type`.name, l.url.toString)),
      startDate = event.startDate.toEpochMilli,
      duration = event.duration.map(_.toMillis),
      people = Some(Set.empty)
    )
  }

  val indexMapping = properties(
    KeywordField("event_id"),
    KeywordField("category"),
    TextField("name"),
    TextField("description", analyzer = Some("htmlStripAnalyzer")),
    KeywordField("thumb"),
    KeywordField("children_ids"),
    NestedField(
      "tags",
      properties = Seq(
        KeywordField("key"),
        TextField("value")
      )
    ),
    NestedField(
      "links",
      properties = Seq(
        KeywordField("type"),
        KeywordField("url")
      )
    ),
    DateField("start_date"),
    LongField("duration"),
    NestedField(
      "people",
      properties = Seq(
        KeywordField("person_id"),
        KeywordField("role")
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

  val indexSettings: Map[String, Any] = Map(
    "analysis" -> Map(
      "analyzer" -> Map(
        "htmlStripAnalyzer" -> Map(
          "type" -> "custom",
          "tokenizer" -> "standard",
          "filter" -> List("lowercase"),
          "char_filter" -> List("html_strip")
        )
      )
    )
  )
}
