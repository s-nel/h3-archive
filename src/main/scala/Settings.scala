package com.snacktrace.archive

import com.snacktrace.archive.Settings.{
  ElasticsearchSettings,
  SessionSettings,
  SpotifySettings,
  TranscriptionSettings,
  YouTubeSettings
}
import com.typesafe.config.Config

import scala.util.Try

final case class Settings(
    elasticsearch: ElasticsearchSettings,
    session: SessionSettings,
    youTube: YouTubeSettings,
    spotify: SpotifySettings,
    transcription: Option[TranscriptionSettings]
)

object Settings {
  final case class ElasticsearchSettings(
      host: String,
      readUser: String,
      readPassword: String,
      writeUser: String,
      writePassword: String
  )

  object ElasticsearchSettings {
    def fromConfig(config: Config): ElasticsearchSettings = {
      ElasticsearchSettings(
        config.getString("host"),
        config.getString("readUser"),
        config.getString("readPassword"),
        config.getString("writeUser"),
        config.getString("writePassword")
      )
    }
  }

  final case class SessionSettings(secret: String)

  object SessionSettings {
    def fromConfig(config: Config): SessionSettings = {
      SessionSettings(config.getString("secret"))
    }
  }

  final case class YouTubeSettings(apiKey: String)

  object YouTubeSettings {
    def fromConfig(config: Config): YouTubeSettings = {
      YouTubeSettings(config.getString("apiKey"))
    }
  }

  final case class SpotifySettings(clientId: String, clientSecret: String)

  object SpotifySettings {
    def fromConfig(config: Config): SpotifySettings = {
      SpotifySettings(config.getString("clientId"), config.getString("clientSecret"))
    }
  }

  final case class TranscriptionSettings(bin: Option[String], workingDir: Option[String])

  object TranscriptionSettings {
    def fromConfig(config: Config): TranscriptionSettings = {
      TranscriptionSettings(Try(config.getString("bin")).toOption, Try(config.getString("working-dir")).toOption)
    }
  }

  def fromConfig(config: Config): Settings = {
    val root = config.getConfig("h3archive")
    val es = ElasticsearchSettings.fromConfig(root.getConfig("elasticsearch"))
    val sessions = SessionSettings.fromConfig(root.getConfig("sessions"))
    val youtube = YouTubeSettings.fromConfig(root.getConfig("youtube"))
    val spotify = SpotifySettings.fromConfig(root.getConfig("spotify"))
    val transcription = Try(TranscriptionSettings.fromConfig(root.getConfig("transcription"))).toOption
    Settings(es, sessions, youtube, spotify, transcription)
  }
}
