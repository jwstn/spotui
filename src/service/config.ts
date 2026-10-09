import { Effect, Result, Schema } from "effect"
import { refresh } from "effect/unstable/reactivity/Atom"
import { stat, mkdir, readFile, writeFile, chmod } from "node:fs/promises"
import { dirname as nodeDirname, join as nodeJoin } from "node:path"

export const ConfigPlatform = Schema.Literals(["linux", "macos", "windows"])
export type ConfigPlatform = typeof ConfigPlatform.Type

export const KEYMASTER_CLIENT_ID = "65b708073fc0480ea92a077233ca87bd"

export const SpotifyCredentials = Schema.Struct({
  clientId: Schema.String,
  refreshToken: Schema.String,
})
export type SpotifyCredentials = typeof SpotifyCredentials.Type

export const PlaybackCredentials = Schema.Struct({
  username: Schema.String,
  credentialsJson: Schema.String,
})
export type PlaybackCredentials = typeof PlaybackCredentials.Type

export const playbackCredentialsPathFor = (configPath: string) =>
  nodeJoin(nodeDirname(configPath), "playback.json")

export const readPlaybackCredentials = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      const file = Bun.file(path)
      if (!(await file.exists())) return null
      return JSON.parse(await readFile(path, "utf8")) as PlaybackCredentials
    },
    catch: (cause) =>
      new Error(
        `Spotify playback credentials could not be read: ${String(cause)}`
      ),
  })

export const writePlaybackCredentials = (
  path: string,
  credentials: PlaybackCredentials
) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(nodeDirname(path), { recursive: true })
      await writeFile(path, JSON.stringify(credentials), { mode: 0o600 })
      await chmod(path, 0o600)
    },
    catch: (cause) =>
      new Error(
        `Spotify playback credentials could not be written: ${String(cause)}`
      ),
  })

export const ParsedSpotifyConfig = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("ready"),
    path: Schema.String,
    ...SpotifyCredentials.fields,
  }),
  Schema.Struct({
    kind: Schema.Literal("invalid"),
    path: Schema.String,
    message: Schema.String,
  }),
])
export type ParsedSpotifyConfig = typeof ParsedSpotifyConfig.Type

export const ConfigPath = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("default"),
    path: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("override"),
    path: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("invalid"),
    path: Schema.String,
    message: Schema.String,
  }),
])
export type ConfigPath = typeof ConfigPath.Type

export const ConfigPathInput = Schema.Struct({
  platform: ConfigPlatform,
  home: Schema.String,
  xdgConfigHome: Schema.String,
  override: Schema.String,
})

const isAbsolutePath = (value: Schema.Schema.Type<typeof Schema.String>) =>
  Effect.succeed(
    value.startsWith("/") ||
      /^[A-Za-z]:[\\/]/.test(value) ||
      value.startsWith("\\\\")
  )

export const configPathFor = Effect.fnUntraced(function* (
  platform: ConfigPlatform,
  home: Schema.Schema.Type<typeof Schema.String>,
  xdgConfigHome: Schema.Schema.Type<typeof Schema.String>
) {
  if (platform === "linux") {
    return yield* Effect.succeed(
      `${xdgConfigHome ?? `${home}/.config`}/spotui/config.toml`
    )
  }

  if (platform === "macos") {
    return yield* Effect.succeed(
      `${home}/Library/Application Support/spotui/config.toml`
    )
  }

  return yield* Effect.succeed(`${home}\\AppData\\Local\\spotui\\config.toml`)
})

export class ConfigResolveError extends Schema.TaggedError<ConfigResolveError>()(
  "SpotUI/ConfigResolveError",
  { path: Schema.String, message: Schema.String, cause: Schema.Unknown }
) {}
export const resolveConfigPath = Effect.fn("resolveConfigPath")(
  (input: typeof ConfigPathInput.Type) =>
    Effect.gen(function* () {
      const override = input.override?.trim()
      if (override) {
        return yield* Effect.suspend(() =>
          isAbsolutePath(override)
            ? Effect.succeed({ kind: "override", path: override })
            : Effect.fail(
                new ConfigResolveError({
                  cause: "invalid",
                  path: override,
                  message: "SPOTIFY_CONFIG must be an absolute path.",
                })
              )
        )
      }

      return yield* Effect.succeed({
        kind: "default",
        path: yield* configPathFor(
          input.platform,
          input.home,
          input.xdgConfigHome
        ),
      })
    })
)
const textField = Effect.fnUntraced(function* (
  value: Schema.Schema.Type<typeof Schema.Unknown>
) {
  if (typeof value !== "string") return yield* Effect.succeed(null)

  return yield* Effect.succeed(value.trim())
})

const ConfigFileSchema = Schema.Struct({
  spotify: Schema.optionalKey(
    Schema.Struct({
      client_id: Schema.optionalKey(Schema.String),
      refresh_token: Schema.optionalKey(Schema.String),
    })
  ),
})

export const parseSpotifyConfig = Effect.fn("parseSpotifyConfig")(
  (contents: string, path: string) =>
    Effect.gen(function* () {
      const parsedConfigContents = yield* Effect.result(
        Effect.try({
          try: () => Bun.TOML.parse(contents),
          catch: (cause) => cause,
        })
      )

      if (Result.isFailure(parsedConfigContents)) {
        return yield* Effect.fail({
          kind: "invalid",
          path,
          message: "config is not valid TOML",
        })
      }

      const decodedConfigContents = yield* Effect.result(
        Effect.try({
          try: () =>
            Schema.decodeUnknownSync(ConfigFileSchema)(parsedConfigContents),
          catch: (cause) => cause,
        })
      )

      if (Result.isFailure(decodedConfigContents)) {
        return yield* Effect.fail({
          kind: "invalid",
          path,
          message: "Config fields are invalid.",
        })
      }

      if (!decodedConfigContents.success) {
        return yield* Effect.fail({
          kind: "invalid",
          path,
          message: "Missing [spotify] section.",
        })
      }

      const clientId = yield* textField(
        decodedConfigContents.success.spotify?.client_id
      ) ?? KEYMASTER_CLIENT_ID

      const refreshToken = yield* textField(
        decodedConfigContents.success.spotify?.refresh_token
      )

      if (!refreshToken) {
        return yield* Effect.fail({
          kind: "invalid",
          path,
          message: "Missing spotify refresh_token",
        })
      }

      return yield* Effect.succeed({
        kind: "ready",
        path,
        clientId,
        refreshToken,
      })
    })
)

export class ConfigReadError extends Schema.TaggedError<ConfigReadError>()(
  "SpotUI/ConfigReadError",
  { path: Schema.String, message: Schema.String, cause: Schema.Unknown }
) {}

export const readConfig = Effect.fn("readConfig")((path: string) =>
  Effect.gen(function* () {
    const file = Bun.file(path)

    const exists = yield* Effect.result(
      Effect.tryPromise({
        try: () => file.exists(),
        catch: (cause) => cause,
      })
    )

    if (Result.isFailure(exists)) {
      return yield* Effect.fail(
        new ConfigReadError({
          path,
          cause: exists.toString(),
          message: "Config file not found",
        })
      )
    }

    if (process.platform !== "win32") {
      const fileStats = yield* Effect.tryPromise({
        try: () => stat(path),
        catch: (cause) =>
          new ConfigReadError({
            path,
            message: "Config could not be read.",
            cause,
          }),
      })

      const permissions = fileStats.mode & 0o777

      if ((permissions & 0o077) !== 0) {
        return yield* Effect.fail(
          new ConfigReadError({
            cause: "invalid permission",
            path,
            message: "Config permissions are too broad; use chmod 600.",
          })
        )
      }
    }

    const contents = yield* Effect.result(
      Effect.tryPromise({
        try: () => file.text(),
        catch: (cause) => cause,
      })
    )

    if (Result.isFailure(contents)) {
      return yield* Effect.fail(
        new ConfigReadError({
          path,
          cause: contents.toString(),
          message: "Could not read config contents",
        })
      )
    }

    return yield* parseSpotifyConfig(contents.success, path)
  })
)
