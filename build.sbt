ThisBuild / version := "0.1.0-SNAPSHOT"

ThisBuild / scalaVersion := "2.13.10"

lazy val root = (project in file("."))
  .settings(
    name := "archive",
    idePackagePrefix := Some("com.snacktrace.archive"),
    libraryDependencies ++= Seq(
      "com.github.jwt-scala" %% "jwt-core" % "9.2.0",
      "com.sksamuel.elastic4s" %% "elastic4s-client-akka" % "8.5.3",
      "com.typesafe.akka" %% "akka-actor" % "2.7.0",
      "com.typesafe.akka" %% "akka-http" % "10.2.10",
      "com.typesafe.akka" %% "akka-http-core" % "10.2.10",
      "com.typesafe.akka" %% "akka-stream" % "2.7.0",
      "de.heikoseeberger" %% "akka-http-circe" % "1.40.0-RC3",
      "io.circe" %% "circe-core" % "0.14.3",
      "io.circe" %% "circe-generic-extras" % "0.14.3",
      "io.circe" %% "circe-parser" % "0.14.3",
      "org.typelevel" %% "cats-core" % "2.9.0"
    )
  )
