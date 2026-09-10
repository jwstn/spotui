import { Effect, Schema } from "effect"
import { stat } from "node:fs/promises"

export type ConfigPlatform = "linux" | "macos" | "windows"

export interface SpotifyCredentials {
  readonly clientId: string
  readonly refreshToken: string
}

export type ParsedSpotifyConfig =
  | ({ readonly kind: "ready"; readonly path: string } & SpotifyCredentials)
  | {
      readonly kind: "invalid"
      readonly path: string
      readonly message: string
    }

export type ConfigPath =
  | { readonly kind: "default"; readonly path: string }
  | { readonly kind: "override"; readonly path: string }
  | { readonly kind: "invalid"; readonly path: string; readonly message: string }

export interface ConfigPathInput {
  readonly platform: ConfigPlatform
  readonly home: string
  readonly xdgConfigHome?: string
  readonly override?: string
}

const join = (parts: readonly string[], separator: "/" | "\\") =>
  parts
    .map((part) => part.replace(/^[/\\]+|[/\\]+$/g, ""))
    .filter(Boolean)
    .join(separator)

const isAbsolutePath = (value: string) =>
  value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\")

export const configPathFor = (
  platform: ConfigPlatform,
  home: string,
  xdgConfigHome?: string
) => {
  if (platform === "linux") {
    return `${xdgConfigHome ?? `${home}/.config`}/spotui/config.toml`
  }

  if (platform === "macos") {
    return `${home}/Library/Application Support/spotui/config.toml`
  }

  return `${home}\\AppData\\Local\\spotui\\config.toml`
}

export const resolveConfigPath = (input: ConfigPathInput): ConfigPath => {
  const override = input.override?.trim()
  if (override) {
    return isAbsolutePath(override)
      ? { kind: "override", path: override }
      : {
          kind: "invalid",
          path: override,
          message: "SPOTIFY_CONFIG must be an absolute path.",
        }
  }

  return {
    kind: "default",
    path: configPathFor(input.platform, input.home, input.xdgConfigHome),
  }
}

const textField = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

const ConfigFileSchema = Schema.Struct({
  spotify: Schema.optionalKey(
    Schema.Struct({
      client_id: Schema.optionalKey(Schema.String),
      refresh_token: Schema.optionalKey(Schema.String),
    })
  ),
})

export const parseSpotifyConfig = (
  contents: string,
  path: string
): ParsedSpotifyConfig => {
  let value: unknown
  try {
    value = Bun.TOML.parse(contents)
  } catch {
    return { kind: "invalid", path, message: "Config is not valid TOML." }
  }

  let decoded: Schema.Schema.Type<typeof ConfigFileSchema>
  try {
    decoded = Schema.decodeUnknownSync(ConfigFileSchema)(value)
  } catch {
    return { kind: "invalid", path, message: "Config fields are invalid." }
  }

  if (!decoded.spotify) {
    return { kind: "invalid", path, message: "Missing [spotify] section." }
  }

  const clientId = textField(decoded.spotify.client_id)
  if (!clientId) {
    return { kind: "invalid", path, message: "Missing spotify.client_id." }
  }

  const refreshToken = textField(decoded.spotify.refresh_token)
  if (!refreshToken) {
    return { kind: "invalid", path, message: "Missing spotify.refresh_token." }
  }

  return { kind: "ready", path, clientId, refreshToken }
}

export class ConfigReadError extends Schema.TaggedError<ConfigReadError>()(
  "SpotUI/ConfigReadError",
  { path: Schema.String, message: Schema.String, cause: Schema.Unknown }
) {}

export const readConfig = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      const file = Bun.file(path)
      if (!(await file.exists())) {
        return { kind: "missing" as const, path }
      }
      if (process.platform !== "win32") {
        const permissions = (await stat(path)).mode & 0o777
        if ((permissions & 0o077) !== 0) {
          return {
            kind: "invalid" as const,
            path,
            message: "Config permissions are too broad; use chmod 600.",
          }
        }
      }
      return parseSpotifyConfig(await file.text(), path)
    },
    catch: (cause) =>
      new ConfigReadError({
        path,
        message: "Config could not be read.",
        cause,
      }),
  })
