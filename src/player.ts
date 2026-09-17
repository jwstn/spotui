import type {
  ConnectEvent,
  LibrespotSession,
  StreamHandle,
} from "@lox-audioserver/node-librespot"
import {
  createSessionWithCredentials,
  setLogLevel,
  startZeroconfLogin,
} from "@lox-audioserver/node-librespot"
import type { PlaybackCredentials } from "./service/config"

const SAMPLE_RATE = 44100
const CHANNELS = 2
const FALLBACK_BITRATE = 320

export interface PcmOutput {
  readonly write: (chunk: Uint8Array) => boolean
  readonly dispose: () => void
}

export const playerCommandFor = (
  available: (command: string) => boolean
): readonly string[] | null => {
  if (available("pacat")) {
    return [
      "pacat",
      "--format=s16le",
      `--rate=${SAMPLE_RATE}`,
      `--channels=${CHANNELS}`,
      "-",
    ]
  }
  if (available("aplay")) {
    return [
      "aplay",
      "-q",
      "-f",
      "S16_LE",
      "-r",
      String(SAMPLE_RATE),
      "-c",
      String(CHANNELS),
      "-",
    ]
  }
  return null
}

export class PcmSink implements PcmOutput {
  private process: ReturnType<typeof Bun.spawn> | null = null
  constructor(private readonly command: readonly string[] | null) {}

  get supported(): boolean {
    return this.command !== null
  }

  private ensure() {
    if (!this.process) {
      if (!this.command) {
        throw new Error(
          "No local PCM player is available (install pacat or aplay)."
        )
      }
      this.process = Bun.spawn({
        cmd: [...this.command],
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
      })
    }
    return this.process
  }

  write(chunk: Uint8Array): boolean {
    try {
      const stdin = this.ensure().stdin
      if (typeof stdin === "number" || !stdin) return false
      const result = stdin.write(chunk)
      if (typeof result !== "number") void result.catch(() => void 0)
      return true
    } catch {
      return false
    }
  }

  dispose() {
    if (this.process) {
      try {
        this.process.kill()
      } catch {
        // The player process may already have exited.
      }
      this.process = null
    }
  }
}

export interface PlaybackEvent {
  readonly type:
    "loading" | "playing" | "paused" | "stopped" | "end_of_track" | "error"
  readonly uri: string | null
  readonly title: string | null
  readonly artist: string | null
  readonly album: string | null
  readonly positionMs: number | null
  readonly durationMs: number | null
  readonly message: string | null
}

export interface PlaybackTarget {
  readonly uris: readonly string[]
}

export interface PlaybackHandle {
  readonly output: "local" | "none"
  readonly subscribe: (listener: (event: PlaybackEvent) => void) => () => void
  readonly play: (target: PlaybackTarget) => Promise<void>
  readonly pause: () => Promise<void>
  readonly resume: () => Promise<void>
  readonly stop: () => Promise<void>
  readonly next: () => Promise<void>
  readonly previous: () => Promise<void>
  readonly close: () => Promise<void>
}

export interface PlaybackHost {
  readonly start: () => Promise<PlaybackHandle>
}

export interface PlaybackHostInput {
  readonly deviceName: string
  readonly loadCredentials: () => Promise<PlaybackCredentials | null>
}

/**
 * Pair playback via Spotify's Zeroconf handshake: a temporary `SpotUI` device
 * is advertised locally and the user picks it in the Spotify app, which hands
 * over reusable stored credentials. This is the only playback-authorization
 * path Spotify still accepts (the OAuth-token borrow in `loginWithAccessToken`
 * was deprecated in August 2026).
 */
export const pairPlaybackCredentials = async (opts: {
  readonly deviceId: string
  readonly name: string
  readonly timeoutMs: number
}): Promise<PlaybackCredentials> => {
  const result = await startZeroconfLogin(
    opts.deviceId,
    opts.name,
    opts.timeoutMs
  )
  const raw = result as unknown as {
    username?: string
    credentialsJson?: string
    credentials_json?: string
  }
  const credentialsJson =
    typeof raw?.credentialsJson === "string"
      ? raw.credentialsJson
      : typeof raw?.credentials_json === "string"
        ? raw.credentials_json
        : ""
  if (!credentialsJson) {
    throw new Error("Zeroconf pairing returned no credentials")
  }
  return { username: raw.username ?? "", credentialsJson }
}

const toPlaybackEvent = (event: ConnectEvent): PlaybackEvent | null => {
  switch (event.type) {
    case "loading":
    case "playing":
    case "paused":
    case "stopped":
      return {
        type: event.type,
        uri: event.uri ?? null,
        title: event.title ?? null,
        artist: event.artist ?? null,
        album: event.album ?? null,
        positionMs: event.positionMs ?? null,
        durationMs: event.durationMs ?? null,
        message: null,
      }
    case "error":
    case "unavailable":
      return {
        type: "error",
        uri: event.uri ?? null,
        title: event.title ?? null,
        artist: event.artist ?? null,
        album: event.album ?? null,
        positionMs: event.positionMs ?? null,
        durationMs: event.durationMs ?? null,
        message: event.errorMessage ?? event.errorCode ?? "Playback failed.",
      }
    default:
      return null
  }
}

interface TrackMeta {
  readonly uri: string | null
  readonly title: string | null
  readonly artist: string | null
  readonly album: string | null
  readonly durationMs: number | null
}

const emptyMeta = (uri: string): TrackMeta => ({
  uri,
  title: null,
  artist: null,
  album: null,
  durationMs: null,
})

export const createLibrespotHost = (
  input: PlaybackHostInput
): PlaybackHost => ({
  start: async (): Promise<PlaybackHandle> => {
    const credentials = await input.loadCredentials()
    if (!credentials) {
      throw new Error(
        'Spotify playback is not authorized. Re-run the login flow; playback needs a Premium account and the "streaming" scope.'
      )
    }

    setLogLevel("error")
    let session: LibrespotSession
    try {
      session = await createSessionWithCredentials(
        credentials.credentialsJson,
        input.deviceName
      )
    } catch (cause) {
      throw new Error(
        `The local Spotify session could not be started; re-login to refresh it. (${String(cause)})`
      )
    }

    const sink = new PcmSink(
      playerCommandFor((command) => Bun.which(command) !== null)
    )
    const listeners = new Set<(event: PlaybackEvent) => void>()
    const emit = (event: PlaybackEvent) => {
      for (const listener of listeners) listener(event)
    }

    let stream: StreamHandle | null = null
    let queue: readonly string[] = []
    let index = 0
    let epoch = 0
    let status: "idle" | "loading" | "playing" | "paused" = "idle"
    let basePositionMs = 0
    let startedAt = 0
    let meta: TrackMeta = emptyMeta("")

    const stopStream = () => {
      if (stream) {
        try {
          stream.stop()
        } catch {
          // The stream may already have finished.
        }
        stream = null
      }
    }

    const positionNow = () =>
      status === "playing"
        ? basePositionMs + (Date.now() - startedAt)
        : basePositionMs

    const startTrack = (uri: string, atMs: number, currentEpoch: number) => {
      stopStream()
      status = "loading"
      meta = emptyMeta(uri)
      basePositionMs = atMs
      startedAt = Date.now()
      emit({
        type: "loading",
        uri,
        title: null,
        artist: null,
        album: null,
        positionMs: null,
        durationMs: null,
        message: null,
      })
      try {
        stream = session.streamTrack(
          {
            uri,
            startPositionMs: atMs > 0 ? Math.round(atMs) : undefined,
            bitrate: FALLBACK_BITRATE,
            emitEvents: true,
          },
          (chunk: Buffer) => {
            sink.write(chunk)
          },
          (event: ConnectEvent) => {
            if (currentEpoch !== epoch) return
            if (event.type === "end_of_track") {
              handleEndOfTrack(currentEpoch)
              return
            }
            const mapped = toPlaybackEvent(event)
            if (mapped) emit(mapped)
            if (event.type === "playing") status = "playing"
          },
          () => {}
        )
      } catch (cause) {
        if (currentEpoch !== epoch) return
        status = "idle"
        emit({
          type: "error",
          uri,
          title: null,
          artist: null,
          album: null,
          positionMs: null,
          durationMs: null,
          message:
            typeof cause === "string"
              ? cause
              : "The track could not be streamed.",
        })
      }
    }

    const begin = (nextIndex: number, atMs: number) => {
      epoch += 1
      const currentEpoch = epoch
      const uri = queue[nextIndex]
      if (!uri) return
      index = nextIndex
      startTrack(uri, atMs, currentEpoch)
    }

    const handleEndOfTrack = (currentEpoch: number) => {
      status = "idle"
      if (currentEpoch !== epoch) return
      if (index + 1 < queue.length) {
        begin(index + 1, 0)
        return
      }
      queue = []
      emit({
        type: "stopped",
        uri: meta.uri,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        positionMs: null,
        durationMs: null,
        message: null,
      })
    }

    let handle: PlaybackHandle
    handle = {
      output: sink.supported ? "local" : "none",

      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },

      play: async (target: PlaybackTarget) => {
        queue = [...target.uris]
        index = 0
        if (queue.length === 0) {
          emit({
            type: "error",
            uri: null,
            title: null,
            artist: null,
            album: null,
            positionMs: null,
            durationMs: null,
            message: "Nothing to play.",
          })
          return
        }
        begin(0, 0)
      },

      pause: async () => {
        if (status !== "playing") return
        epoch += 1
        basePositionMs = positionNow()
        status = "paused"
        startedAt = 0
        stopStream()
        emit({
          type: "paused",
          uri: meta.uri,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          positionMs: basePositionMs,
          durationMs: meta.durationMs,
          message: null,
        })
      },

      resume: async () => {
        if (status !== "paused") return
        const uri = queue[index]
        if (!uri) return
        epoch += 1
        const currentEpoch = epoch
        startTrack(uri, basePositionMs, currentEpoch)
      },

      stop: async () => {
        epoch += 1
        stopStream()
        queue = []
        index = 0
        status = "idle"
        basePositionMs = 0
        startedAt = 0
        emit({
          type: "stopped",
          uri: null,
          title: null,
          artist: null,
          album: null,
          positionMs: null,
          durationMs: null,
          message: null,
        })
      },

      next: async () => {
        if (queue.length === 0) return
        if (index + 1 < queue.length) {
          begin(index + 1, 0)
        } else {
          await handle.stop()
        }
      },

      previous: async () => {
        if (queue.length === 0) return
        const at = positionNow()
        if (at > 3000) {
          begin(index, 0)
        } else if (index > 0) {
          begin(index - 1, 0)
        } else {
          begin(index, 0)
        }
      },

      close: async () => {
        epoch += 1
        stopStream()
        queue = []
        sink.dispose()
        void session.close()
      },
    }
    return handle
  },
})
