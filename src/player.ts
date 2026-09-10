import type {
  ConnectEvent,
  ConnectHandle,
} from "@lox-audioserver/node-librespot"
import { setLogLevel, startConnectDeviceWithToken } from "@lox-audioserver/node-librespot"

const SAMPLE_RATE = 44100
const CHANNELS = 2

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
        throw new Error("No local PCM player is available (install pacat or aplay).")
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
    | "loading"
    | "playing"
    | "paused"
    | "stopped"
    | "end_of_track"
    | "error"
  readonly uri: string | null
  readonly title: string | null
  readonly artist: string | null
  readonly album: string | null
  readonly positionMs: number | null
  readonly durationMs: number | null
  readonly message: string | null
}

export interface PlaybackStartInput {
  readonly accessToken: string
  readonly clientId: string
  readonly deviceName: string
  readonly deviceId: string
}

export interface PlaybackHandle {
  readonly output: "local" | "none"
  readonly subscribe: (listener: (event: PlaybackEvent) => void) => () => void
  readonly stop: () => Promise<void>
}

export interface PlaybackHost {
  readonly start: (input: PlaybackStartInput) => Promise<PlaybackHandle>
}

const toPlaybackEvent = (event: ConnectEvent): PlaybackEvent | null => {
  switch (event.type) {
    case "loading":
    case "playing":
    case "paused":
    case "stopped":
    case "end_of_track":
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
      return {
        type: "error",
        uri: event.uri ?? null,
        title: event.title ?? null,
        artist: event.artist ?? null,
        album: event.album ?? null,
        positionMs: null,
        durationMs: null,
        message: event.errorMessage ?? event.errorCode ?? "Playback failed.",
      }
    default:
      return null
  }
}

export const createLibrespotHost = (): PlaybackHost => ({
  start: async (input) => {
    setLogLevel("error")
    const sink = new PcmSink(
      playerCommandFor((command) => Bun.which(command) !== null)
    )
    const listeners = new Set<(event: PlaybackEvent) => void>()
    const emit = (event: PlaybackEvent) => {
      for (const listener of listeners) listener(event)
    }

    let handle: ConnectHandle
    try {
      handle = await startConnectDeviceWithToken(
        input.accessToken,
        input.clientId,
        input.deviceName,
        input.deviceId,
        (chunk: Buffer) => {
          sink.write(chunk)
        },
        (event: ConnectEvent) => {
          const mapped = toPlaybackEvent(event)
          if (mapped) emit(mapped)
        },
        () => {}
      )
    } catch (cause) {
      return Promise.reject(
        new Error(
          `The local Spotify player could not start. Playback requires the "streaming" scope (Premium) and a re-login. (${String(cause)})`
        )
      )
    }

    const sinkAvailable = sink.supported
    return {
      output: sinkAvailable ? "local" : "none",
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      stop: async () => {
        handle.close()
        sink.dispose()
      },
    }
  },
})