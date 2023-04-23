package com.snacktrace.archive

import io.circe.{Decoder, Encoder, Json}
import io.circe.derivation._

object model {
  final case class LinkDoc(`type`: String, url: String)

  object LinkDoc {
    implicit val linkDocDecoderInstance: Decoder[LinkDoc] = deriveDecoder(renaming.snakeCase)
    implicit val linkDocEncoderInstance: Encoder[LinkDoc] = deriveEncoder(renaming.snakeCase)
  }

  final case class TagDoc(key: String, value: String)

  object TagDoc {
    implicit val tagDocDecoderInstance: Decoder[TagDoc] = deriveDecoder(renaming.snakeCase)
    implicit val tagDocEncoderInstance: Encoder[TagDoc] = deriveEncoder(renaming.snakeCase)
  }

  final case class PersonRef(personId: String, role: String)

  object PersonRef {
    implicit val personRefDecoderInstance: Decoder[PersonRef] = deriveDecoder(renaming.snakeCase)
    implicit val personRefEncoderInstance: Encoder[PersonRef] = deriveEncoder(renaming.snakeCase)
  }

  final case class EventDoc(
      eventId: String,
      category: String,
      name: String,
      description: Option[String],
      notes: Option[String],
      thumb: Option[String],
      tags: Option[Set[TagDoc]],
      links: Option[Set[LinkDoc]],
      startDate: Long,
      duration: Option[Long],
      people: Option[Set[PersonRef]],
      transcription: Option[TranscriptionDoc],
      metrics: Option[MetricsDoc]
  )

  object EventDoc {
    implicit val eventDocDecoderInstance: Decoder[EventDoc] = deriveDecoder(renaming.snakeCase)
    implicit val eventDocEncoderInstance: Encoder[EventDoc] = deriveEncoder(renaming.snakeCase)
  }

  final case class MetricsDoc(
      views: Long,
      likes: Long,
      comments: Long
  )

  object MetricsDoc {
    implicit val metricsDocDecoderInstance: Decoder[MetricsDoc] = deriveDecoder(renaming.snakeCase)
    implicit val metricsDocEncoderInstance: Encoder[MetricsDoc] = deriveEncoder(renaming.snakeCase)
  }

  final case class TranscriptionResponse(transcription: TranscriptionDoc)

  object TranscriptionResponse {
    implicit val transcriptionResponseDecoderInstance: Decoder[TranscriptionResponse] = deriveDecoder(
      renaming.snakeCase
    )
    implicit val transcriptionResponseEncoderInstance: Encoder[TranscriptionResponse] = deriveEncoder(
      renaming.snakeCase
    )
  }

  final case class TranscriptionDoc(text: Option[String], segments: Option[List[SegmentDoc]])

  object TranscriptionDoc {
    implicit val transcriptionDocDecoderInstance: Decoder[TranscriptionDoc] = deriveDecoder(renaming.snakeCase)
    implicit val transcriptionDocEncoderInstance: Encoder[TranscriptionDoc] =
      deriveEncoder(renaming.snakeCase).mapJson(_.dropNullValues)
  }

  final case class SegmentDoc(
      id: Int,
      seek: Long,
      start: Float,
      end: Float,
      text: String,
      temperature: Double,
      avgLogprob: Double,
      compressionRatio: Double,
      noSpeechProb: Double
  )

  object SegmentDoc {
    implicit val segmentDocDecoderInstance: Decoder[SegmentDoc] = deriveDecoder(renaming.snakeCase)
    implicit val segmentDocEncoderInstance: Encoder[SegmentDoc] = deriveEncoder(renaming.snakeCase)
  }

  final case class PersonDoc(
      personId: Option[String],
      category: String,
      firstName: String,
      lastName: String,
      displayName: Option[String],
      thumb: Option[String],
      description: Option[String],
      aliases: Option[Set[String]],
      isBeefing: Option[Boolean],
      isSquashedBeef: Option[Boolean]
  )

  object PersonDoc {
    implicit val personDocDecoderInstance: Decoder[PersonDoc] = deriveDecoder(renaming.snakeCase)
    implicit val personDocEncoderInstance: Encoder[PersonDoc] = deriveEncoder(renaming.snakeCase)
  }

  final case class SoundbiteDoc(
      soundbiteId: Option[String],
      personId: String,
      quote: Option[String],
      alt: Option[String],
      soundFile: String,
      description: Option[String],
      winningYear: Option[Int],
      nominatedYear: Option[Int]
  )

  object SoundbiteDoc {
    implicit val soundbiteDocDecoderInstance: Decoder[SoundbiteDoc] = deriveDecoder(renaming.snakeCase)
    implicit val soundbiteDocEncoderInstance: Encoder[SoundbiteDoc] = deriveEncoder(renaming.snakeCase)
  }

  final case class SteamyPerson(personId: Set[String], name: Option[String], won: Boolean)

  object SteamyPerson {
    implicit val steamyPersonDecoderInstance: Decoder[SteamyPerson] = deriveDecoder(renaming.snakeCase)
    implicit val steamyPersonEncoderInstance: Encoder[SteamyPerson] = deriveEncoder(renaming.snakeCase)
  }

  final case class SteamyDoc(
      steamyId: Option[String],
      people: Set[SteamyPerson],
      name: String,
      description: Option[String],
      year: Int
  )
  object SteamyDoc {
    implicit val steamyDocDecoderInstance: Decoder[SteamyDoc] = deriveDecoder(renaming.snakeCase)
    implicit val steamyDocEncoderInstance: Encoder[SteamyDoc] = deriveEncoder(renaming.snakeCase)
  }

  final case class Credentials(user: String, password: String)
  object Credentials {
    implicit val credentialsDecoderInstance: Decoder[Credentials] = deriveDecoder(renaming.snakeCase)
    implicit val credentialsEncoderInstance: Encoder[Credentials] = deriveEncoder(renaming.snakeCase)
  }

  final case class EventWithHighlight(event: EventDoc, highlight: Map[String, Seq[String]])

  object EventWithHighlight {
    implicit val eventWithHighlightDecoderInstance: Decoder[EventWithHighlight] = deriveDecoder(renaming.snakeCase)
    implicit val eventWithHighlightEncoderInstance: Encoder[EventWithHighlight] = deriveEncoder(renaming.snakeCase)
  }

  final case class EventsResults(results: List[EventWithHighlight], total: Long)

  object EventsResults {
    implicit val eventsResultsDecoderInstance: Decoder[EventsResults] = deriveDecoder(renaming.snakeCase)
    implicit val eventsResultsEncoderInstance: Encoder[EventsResults] = deriveEncoder(renaming.snakeCase)
  }

  final case class SearchRequest(
      query: Json,
      size: Option[Int],
      from: Option[Int],
      sort: Option[Map[String, String]]
  )

  object SearchRequest {
    implicit val searchRequestDecoderInstance: Decoder[SearchRequest] = deriveDecoder(renaming.snakeCase)
    implicit val searchRequestEncoderInstance: Encoder[SearchRequest] = deriveEncoder(renaming.snakeCase)
  }

  final case class PartialSearchRequest(
      size: Option[Int],
      from: Option[Int],
      sort: Option[Map[String, String]]
  )

  object PartialSearchRequest {
    implicit val partialSearchRequestDecoderInstance: Decoder[PartialSearchRequest] = deriveDecoder(renaming.snakeCase)
    implicit val partialSearchRequestEncoderInstance: Encoder[PartialSearchRequest] = deriveEncoder(renaming.snakeCase)
  }

  sealed trait LinkType {
    val name: String
  }

  object LinkType {
    case object Spotify extends LinkType {
      override val name = "spotify"
    }

    case object YouTube extends LinkType {
      override val name = "youtube"
    }
  }

  sealed trait Category {
    val name: String
  }

  object Category {
    sealed trait Content extends Category

    object Content {
      case object Video extends Content {
        override val name = "video"
      }

      case object Podcast extends Content {
        override val name = "podcast"
      }
    }
  }
}
