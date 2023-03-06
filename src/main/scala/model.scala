package com.snacktrace.archive

import java.net.URI
import java.time.{Duration, Instant}

object model {
  final case class EventId(value: String) extends AnyVal

  final case class Event(
      id: EventId,
      name: String,
      description: String,
      category: Category,
      thumb: Option[Thumb],
      children: Set[Event],
      tags: Set[Tag],
      links: Set[Link],
      startDate: Instant,
      duration: Option[Duration]
  )

  final case class Tag(key: String, value: String)

  final case class Thumb(value: String)

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

    val all = List(Spotify)
  }

  final case class Link(`type`: LinkType, url: URI)

  sealed trait Category {
    val name: String
  }

  object Category {
    sealed trait Content extends Category

    object Content {
      case object Video extends Content {
        override val name = "video"
      }

      case object Livestream extends Content {
        override val name = "livestream"
      }

      case object Podcast extends Content {
        override val name = "podcast"
      }
    }

    sealed trait Meme extends Category

    object Meme {
      case object SoundBite extends Meme {
        override val name = "sound-bite"
      }
    }

    sealed trait Appearance extends Category

    object Appearance {
      case object Guest extends Appearance {
        override val name = "guest"
      }

      case object Crew extends Appearance {
        override val name = "crew"
      }
    }

    val all = List(
      Content.Video,
      Content.Livestream,
      Content.Podcast,
      Meme.SoundBite,
      Appearance.Guest,
      Appearance.Crew
    )
  }
}
