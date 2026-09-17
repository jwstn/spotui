import { useRenderer, useTerminalDimensions } from "@opentui/react"
import { useBindings } from "@opentui/keymap/react"
import { Effect } from "effect"
import { useEffect, useState } from "react"

import {
  readConfig,
  resolveConfigPath,
  type ConfigPath,
} from "#/service/config"
import { logFilePathFor } from "#/log"
import type { BridgeSnapshot } from "#/service/bridge"
import {
  commandBindingDefinitions,
  dispatchCommand,
  type CommandId,
} from "#/commands"
import { authorizeWithPkce, createLiveBridge } from "#/service/runtime"

import { Input } from "#/components/ui/input"
import CommandPalette from "#/components/CommandPalette"
import Text from "#/components/Text"
import TitleBar from "#/components/TitleBar"

const configPath = resolveConfigPath({
  platform:
    process.platform === "darwin"
      ? "macos"
      : process.platform === "win32"
        ? "windows"
        : "linux",
  home: process.env.HOME ?? process.env.USERPROFILE ?? ".",
  xdgConfigHome: process.env.XDG_CONFIG_HOME,
  override: process.env.SPOTIFY_CONFIG,
})

type AppState =
  | { readonly kind: "loading"; readonly path: ConfigPath }
  | { readonly kind: "login"; readonly path: string; readonly message: string }
  | { readonly kind: "error"; readonly path: string; readonly message: string }
  | {
      readonly kind: "ready"
      readonly bridge: ReturnType<typeof createLiveBridge>
    }

const LoginScreen = ({
  path,
  message,
  onAuthorized,
}: {
  readonly path: string
  readonly message: string
  readonly onAuthorized: (credentials: {
    readonly clientId: string
    readonly refreshToken: string
  }) => void
}) => {
  const [clientId, setClientId] = useState("")
  const [status, setStatus] = useState<string | null>(null)

  function handleSubmit() {
    setStatus("Opening the Spotify authorization page...")
    void authorizeWithPkce(clientId.trim(), path).then(onAuthorized, (error) =>
      setStatus(String(error))
    )
  }

  return (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <box width={72} flexDirection="column" padding={2}>
        <Text>SPOTIFY LOGIN</Text>
        <Text>Spotify user authorization is required.</Text>
        <Text>{message}</Text>
        <Text>Config path: {path}</Text>
        <Text>Logs: {logFilePathFor(path)}</Text>
        <Text>
          Optional: enter a Spotify Developer Dashboard client ID to browse with
          your own app. Leave empty to use Spotify's keymaster client:
        </Text>
        <Input
          onInput={setClientId}
          onSubmit={handleSubmit}
          placeholder="client id goes here (optional).."
        />
        <Text>
          Enter to open the PKCE browser flow. A Premium account is needed for
          playback.
        </Text>
        <Text>
          After login, run `bun run pair` in another terminal and tap "SpotUI"
          in the Spotify app to enable playback.
        </Text>
        <Text>{status ?? "SpotUI manages access via PKCE."}</Text>
      </box>
    </box>
  )
}

const ReadyScreen = ({
  bridge,
  snapshot,
}: {
  readonly bridge: ReturnType<typeof createLiveBridge>
  readonly snapshot: BridgeSnapshot
}) => {
  const renderer = useRenderer()

  const [paletteOpen, setPaletteOpen] = useState(false)
  const items =
    snapshot.playlistItems?.items ??
    snapshot.collections[snapshot.activeCollection].items
  const currentState =
    snapshot.playlistItems ?? snapshot.collections[snapshot.activeCollection]
  const runCommand = (id: CommandId) => {
    console.log(id)
    void dispatchCommand(bridge, id)
  }

  useBindings(() => ({
    commands: [
      {
        name: "app.quit",
        run() {
          renderer.destroy()
        },
      },
      {
        name: "app.openPallette",
        run() {
          setPaletteOpen(false)
        },
      },
      {
        name: "app.reload",
        run() {
          runCommand("refresh")
        },
      },
      {
        name: "app.load-more",
        run() {
          runCommand("load-more")
        },
      },
      {
        name: "app.toggle-play",
        run() {
          runCommand("toggle-play")
        },
      },
      {
        name: "app.stop",
        run() {
          runCommand("stop")
        },
      },
      {
        name: "app.back",
        run() {
          runCommand("back")
        },
      },
      {
        name: "app.commandPalette",
        run() {
          setPaletteOpen(true)
        },
      },
      {
        name: "app.moveUp",
        run() {
          runCommand("moveUp")
        },
      },
      {
        name: "app.moveDown",
        run() {
          runCommand("moveDown")
        },
      },
      {
        name: "app.open",
        run() {
          runCommand("open")
        },
      },
    ],
    bindings: commandBindingDefinitions.map((command) => ({
      key: command.key,
      cmd: command.cmd,
    })),
  }))

  return (
    <box flexGrow={1} position="relative" flexDirection="column">
      <TitleBar />
      <CommandPalette open={paletteOpen} handleOpenChange={setPaletteOpen} />
    </box>
  )
}

const BridgeView = ({
  bridge,
  onAuthorized,
}: {
  readonly bridge: ReturnType<typeof createLiveBridge>
  readonly onAuthorized: (credentials: {
    readonly clientId: string
    readonly refreshToken: string
  }) => void
}) => {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot>(bridge.getSnapshot())
  useEffect(
    () => bridge.subscribe(() => setSnapshot(bridge.getSnapshot())),
    [bridge]
  )
  if (snapshot.auth === "error") {
    return (
      <LoginScreen
        path={configPath.path}
        message={snapshot.authError ?? "Authorization required."}
        onAuthorized={onAuthorized}
      />
    )
  }

  if (snapshot.auth !== "ready") {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <Text>Authorizing Spotify...</Text>
      </box>
    )
  }

  return <ReadyScreen bridge={bridge} snapshot={snapshot} />
}

export default function App() {
  const { width = 100, height = 24 } = useTerminalDimensions()
  const [state, setState] = useState<AppState>({
    kind: "loading",
    path: configPath,
  })
  const onAuthorized = (credentials: {
    readonly clientId: string
    readonly refreshToken: string
  }) => {
    const bridge = createLiveBridge(credentials, configPath.path)
    setState({ kind: "ready", bridge })
    void bridge.start()
  }

  useEffect(() => {
    if (configPath.kind === "invalid") {
      setState({
        kind: "error",
        path: configPath.path,
        message: configPath.message,
      })
      return
    }
    void Effect.runPromise(readConfig(configPath.path)).then(
      (result) => {
        if (result.kind === "missing") {
          setState({
            kind: "login",
            path: result.path,
            message: "No credentials are configured yet.",
          })
        } else if (result.kind === "invalid") {
          setState({
            kind: configPath.kind === "override" ? "error" : "login",
            path: result.path,
            message: result.message,
          })
        } else {
          const bridge = createLiveBridge(result, result.path)
          setState({ kind: "ready", bridge })
          void bridge.start()
        }
      },
      (error) => {
        setState({
          kind: configPath.kind === "override" ? "error" : "login",
          path: configPath.path,
          message: String(error),
        })
      }
    )
  }, [])

  if (width < 60 || height < 16) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <Text>Need a terminal at least 60x16.</Text>
      </box>
    )
  }
  if (state.kind === "loading")
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <Text>Loading SpotUI...</Text>
      </box>
    )
  if (state.kind === "login") {
    return (
      <LoginScreen
        path={state.path}
        message={state.message}
        onAuthorized={onAuthorized}
      />
    )
  }
  return <BridgeView bridge={state.bridge} onAuthorized={onAuthorized} />
}
