package com.snacktrace.archive

import com.snacktrace.archive.Settings.{ElasticsearchSettings, SessionSettings}
import com.typesafe.config.Config

final case class Settings(
    elasticsearch: ElasticsearchSettings,
    session: SessionSettings
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
    def apply(config: Config): ElasticsearchSettings = {
      ElasticsearchSettings(
        config.getString("host"),
        config.getString("readUser"),
        config.getString("readPassword"),
        config.getString("writeUser"),
        config.getString("writePassword")
      )
    }
  }

  final case class SessionSettings(
      secret: String
  )

  object SessionSettings {
    def apply(config: Config): SessionSettings = {
      SessionSettings(config.getString("secret"))
    }
  }

  def apply(config: Config): Settings = {
    val root = config.getConfig("h3archive")
    val es = ElasticsearchSettings(root.getConfig("elasticsearch"))
    val sessions = SessionSettings(root.getConfig("sessions"))
    Settings(es, sessions)
  }
}
