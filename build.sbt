ThisBuild / version := "0.1.0-SNAPSHOT"

ThisBuild / scalaVersion := "2.13.10"

lazy val root = (project in file("."))
  .settings(
    name := "archive",
    idePackagePrefix := Some("com.snacktrace.archive"),
    libraryDependencies ++= Seq(
      "ch.qos.logback" % "logback-classic" % "1.4.6",
      "com.github.dfabulich" % "sitemapgen4j" % "1.1.1",
      "com.github.jwt-scala" %% "jwt-core" % "9.2.0",
      "com.sksamuel.elastic4s" %% "elastic4s-client-akka" % "8.5.3",
      "com.typesafe.akka" %% "akka-actor" % "2.7.0",
      "com.typesafe.akka" %% "akka-http" % "10.2.10",
      "com.typesafe.akka" %% "akka-http-core" % "10.2.10",
      "com.typesafe.akka" %% "akka-stream" % "2.7.0",
      "de.heikoseeberger" %% "akka-http-circe" % "1.40.0-RC3",
      "io.circe" %% "circe-core" % "0.13.0",
      "io.circe" %% "circe-derivation" % "0.13.0-M5",
      "io.circe" %% "circe-derivation-annotations" % "0.13.0-M5",
      "io.circe" %% "circe-parser" % "0.13.0",
      "net.logstash.logback" % "logstash-logback-encoder" % "7.3",
      "org.typelevel" %% "cats-core" % "2.9.0"
    ),
    scalacOptions ++= Seq(
      "-Werror",
      "-Xlint:adapted-args,nullary-unit,inaccessible,infer-any,missing-interpolator,doc-detached,private-shadow,type-parameter-shadow,poly-implicit-overload,option-implicit,delayedinit-select,package-object-classes,stars-align,constant,unused,nonlocal-return,implicit-not-found,serial,valpattern,eta-zero,eta-sam,deprecation",
      "-Xlint:unused"
    ),
    wartremoverErrors ++= List(
      Wart.AsInstanceOf,
      Wart.EitherProjectionPartial,
      Wart.IsInstanceOf,
      Wart.IterableOps,
      Wart.Null,
      Wart.OptionPartial,
      Wart.Product,
      Wart.Return,
      Wart.Serializable,
      Wart.StringPlusAny,
      Wart.Throw,
      Wart.TripleQuestionMark,
      Wart.TryPartial,
      Wart.Var
    ),
    ThisBuild / scalafixDependencies += "com.github.liancheng" %% "organize-imports" % "0.6.0",
    semanticdbEnabled := true,
    semanticdbVersion := scalafixSemanticdb.revision,
    assembly / assemblyMergeStrategy := {
      case PathList("META-INF", xs @ _*) => MergeStrategy.discard
      case PathList("reference.conf") => MergeStrategy.concat
      case x => MergeStrategy.first
    },
    assembly / mainClass := Some("com.snacktrace.archive.Server")
  )
