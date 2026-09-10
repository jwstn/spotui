import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react"
import { Effect } from "effect"
import { useEffect, useState } from "react"

import { readConfig, resolveConfigPath, type ConfigPath } from "./config"
import type { BridgeSnapshot } from "./bridge"
import { commandDefinitions, dispatchCommand, type CommandId } from "./commands"
import { authorizeWithPkce, createLiveBridge } from "./runtime"
import { resolveTheme, defaultThemeConfig, type ColorPalette } from "./theme"

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

const collectionLabels = {
  playlists: "Playlists",
  "saved-tracks": "Saved tracks",
  "saved-albums": "Saved albums",
  "followed-artists": "Followed artists",
} as const

const collectionKeys = Object.keys(collectionLabels) as Array<
  keyof typeof collectionLabels
>

const LoginScreen = ({
  path,
  message,
  colors,
  onAuthorized,
}: {
  readonly path: string
  readonly message: string
  readonly colors: ColorPalette
  readonly onAuthorized: (credentials: {
    readonly clientId: string
    readonly refreshToken: string
  }) => void
}) => {
  const [clientId, setClientId] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  useKeyboard((event) => {
    const key = event.name.toLowerCase()
    if (key === "backspace") return setClientId((value) => value.slice(0, -1))
    if (key === "return" || key === "enter") {
      if (!clientId.trim()) return setStatus("Enter a Spotify client ID first.")
      setStatus("Opening the Spotify authorization page...")
      void authorizeWithPkce(clientId.trim(), path).then(
        onAuthorized,
        (error) => setStatus(String(error))
      )
      return
    }
  })

  return (
    <box
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
      backgroundColor={colors.background}
    >
      <box
        width={72}
        flexDirection="column"
        padding={2}
        backgroundColor={colors.panel}
      >
        <text fg={colors.accent}>SPOTIFY LOGIN</text>
        <text fg={colors.text}>Spotify user authorization is required.</text>
        <text fg={colors.muted}>{message}</text>
        <text fg={colors.muted}>Config path: {path}</text>
        <text fg={colors.text}>
          Create an app in the Spotify Developer Dashboard, then enter its
          client ID:
        </text>
        <input
          backgroundColor={colors.selectedBackground}
          onInput={setClientId}
          placeholder="cliend id goes here.."
        />
        <text fg={colors.accent}>
          Enter to open the PKCE browser flow. Esc is not required.
        </text>
        <text fg={colors.muted}>
          {status ?? "SpotUI manages access via PKCE."}
        </text>
      </box>
    </box>
  )
}

const ErrorScreen = ({
  path,
  message,
  colors,
}: {
  readonly path: string
  readonly message: string
  readonly colors: ColorPalette
}) => (
  <box
    flexGrow={1}
    justifyContent="center"
    alignItems="center"
    backgroundColor={colors.background}
  >
    <box
      width={72}
      flexDirection="column"
      padding={2}
      backgroundColor={colors.panel}
    >
      <text fg={colors.error}>SPOTUI CONFIGURATION ERROR</text>
      <text fg={colors.text}>{message}</text>
      <text fg={colors.muted}>Path: {path}</text>
      <text fg={colors.muted}>
        Fix the explicit SPOTIFY_CONFIG file and restart.
      </text>
    </box>
  </box>
)

const statusText = (state: {
  readonly status: string
  readonly error: string | null
}) => {
  if (state.status === "loading") return "Loading..."
  if (state.status === "refreshing") return "Refreshing..."
  if (state.status === "error") return state.error ?? "Request failed"
  return ""
}

const DetailPanel = ({
  snapshot,
  colors,
}: {
  readonly snapshot: BridgeSnapshot
  readonly colors: ColorPalette
}) => {
  const items =
    snapshot.playlistItems?.items ??
    snapshot.collections[snapshot.activeCollection].items
  const selected = items[snapshot.selectedIndex] as
    | {
        readonly kind?: string
        readonly name?: string
        readonly id?: string | null
      }
    | undefined
  return (
    <box
      width={30}
      flexDirection="column"
      padding={1}
      borderStyle="single"
      borderColor={colors.separator}
    >
      <text fg={colors.accent}>DETAIL</text>
      <text fg={colors.text}>{selected?.name ?? "Nothing selected"}</text>
      <text fg={colors.muted}>{selected?.kind ?? "Choose a collection"}</text>
      {selected?.id ? <text fg={colors.muted}>id: {selected.id}</text> : null}
      <box flexGrow={1} />
      <text fg={colors.muted}>Enter open</text>
      <text fg={colors.muted}>b back r refresh</text>
    </box>
  )
}

const CommandPalette = ({
  index,
  colors,
}: {
  readonly index: number
  readonly colors: ColorPalette
}) => {
  return (
    <box
      position="absolute"
      left={12}
      top={3}
      width={56}
      flexDirection="column"
      padding={1}
      backgroundColor={colors.panel}
      borderStyle="single"
      borderColor={colors.accent}
    >
      <text fg={colors.accent}>COMMAND PALETTE</text>
      <text fg={colors.muted}>j/k select Enter run Esc close</text>
      {commandDefinitions.map((command, commandIndex) => (
        <box
          key={command.id}
          backgroundColor={
            commandIndex === index ? colors.selectedBackground : undefined
          }
        >
          <text fg={commandIndex === index ? colors.selectedText : colors.text}>
            {commandIndex === index ? "> " : "  "}
            {command.title}
          </text>
        </box>
      ))}
    </box>
  )
}

const ReadyScreen = ({
  bridge,
  snapshot,
  colors,
}: {
  readonly bridge: ReturnType<typeof createLiveBridge>
  readonly snapshot: BridgeSnapshot
  readonly colors: ColorPalette
}) => {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteIndex, setPaletteIndex] = useState(0)
  const items =
    snapshot.playlistItems?.items ??
    snapshot.collections[snapshot.activeCollection].items
  const currentState =
    snapshot.playlistItems ?? snapshot.collections[snapshot.activeCollection]
  const runCommand = (id: CommandId) => void dispatchCommand(bridge, id)

  useKeyboard((event) => {
    const key = event.name.toLowerCase()
    if (paletteOpen) {
      if (key === "escape") return setPaletteOpen(false)
      if (key === "up" || key === "k")
        return setPaletteIndex(
          (current) =>
            (current + commandDefinitions.length - 1) %
            commandDefinitions.length
        )
      if (key === "down" || key === "j")
        return setPaletteIndex(
          (current) => (current + 1) % commandDefinitions.length
        )
      if (key === "return" || key === "enter") {
        const command = commandDefinitions[paletteIndex]
        if (command) runCommand(command.id)
        return setPaletteOpen(false)
      }
      return
    }
    if ((event.ctrl && key === "p") || key === "/") return setPaletteOpen(true)
    if (key === "up" || key === "k") return bridge.moveSelection(-1)
    if (key === "down" || key === "j") return bridge.moveSelection(1)
    if (key === "return" || key === "enter") return runCommand("open")
    if (key === "backspace" || key === "b") return runCommand("back")
    if (key === "r") return runCommand("refresh")
    if (key === "n") return runCommand("load-more")
    if (key === " ") return runCommand("toggle-play")
    if (key === "s") return runCommand("stop")
    if (event.ctrl && key === "right") return runCommand("next-track")
    if (event.ctrl && key === "left") return runCommand("previous-track")
    if (key === "q") return runCommand("quit")
    const numeric = Number.parseInt(key, 10)
    if (numeric >= 1 && numeric <= collectionKeys.length)
      runCommand(commandDefinitions[numeric - 1]!.id)
  })

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      backgroundColor={colors.background}
    >
      <box height={1} flexDirection="row" paddingLeft={1} paddingRight={1}>
        <text fg={colors.accent}>SPOTUI</text>
        <text fg={colors.muted}>
          {" "}
          {snapshot.playlistId
            ? "Playlist items"
            : collectionLabels[snapshot.activeCollection]}
        </text>
        <box flexGrow={1} />
        <text fg={colors.muted}>/ or Ctrl-P commands q quit</text>
      </box>
      <box height={1} flexDirection="row" backgroundColor={colors.panel}>
        {collectionKeys.map((collection, index) => (
          <text
            key={collection}
            fg={
              collection === snapshot.activeCollection
                ? colors.accent
                : colors.muted
            }
          >
            {index + 1} {collectionLabels[collection]}
          </text>
        ))}
      </box>
      <box flexGrow={1} flexDirection="row">
        <box
          width={24}
          flexDirection="column"
          padding={1}
          borderStyle="single"
          borderColor={colors.separator}
        >
          <text fg={colors.accent}>LIBRARY</text>
          {collectionKeys.map((collection, index) => (
            <box
              key={collection}
              backgroundColor={
                collection === snapshot.activeCollection
                  ? colors.selectedBackground
                  : undefined
              }
            >
              <text
                fg={
                  collection === snapshot.activeCollection
                    ? colors.selectedText
                    : colors.text
                }
              >
                {collection === snapshot.activeCollection ? ">" : " "}{" "}
                {index + 1} {collectionLabels[collection]}
              </text>
            </box>
          ))}
          <box flexGrow={1} />
          <text fg={colors.muted}>ghui theme: ghui</text>
        </box>
        <box flexGrow={1} flexDirection="column" padding={1}>
          <text fg={colors.accent}>
            {snapshot.playlistId
              ? "PLAYLIST ITEMS"
              : collectionLabels[snapshot.activeCollection].toUpperCase()}
          </text>
          <text fg={colors.muted}>{statusText(currentState)}</text>
          {items.length === 0 && currentState.status !== "loading" ? (
            <text fg={colors.muted}>No items loaded.</text>
          ) : null}
          {items.map((item, index) => {
            const named = item as {
              readonly name?: string
              readonly kind?: string
              readonly key?: string
            }
            const selected = index === snapshot.selectedIndex
            return (
              <box
                key={named.key ?? `${named.kind}-${index}`}
                backgroundColor={
                  selected ? colors.selectedBackground : undefined
                }
              >
                <text fg={selected ? colors.selectedText : colors.text}>
                  {selected ? ">" : " "} {String(index + 1).padStart(2, "0")}{" "}
                  {named.name ?? named.kind ?? "Unavailable"}
                </text>
              </box>
            )
          })}
          <box flexGrow={1} />
          <text fg={colors.muted}>
            j/k move Enter open/play n load r refresh b back space play
          </text>
        </box>
        <DetailPanel snapshot={snapshot} colors={colors} />
      </box>
      <box
        height={1}
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={colors.panel}
      >
        <text fg={colors.accent}>
          {snapshot.playback.status === "playing"
            ? "PLAYING"
            : snapshot.playback.status === "paused"
              ? "PAUSED"
              : snapshot.playback.status === "loading"
                ? "LOADING"
                : snapshot.playback.status === "error"
                  ? "ERROR"
                  : "IDLE"}
        </text>
        <text fg={colors.text}>
          {snapshot.playback.track
            ? ` ${snapshot.playback.track.title ?? ""}${
                snapshot.playback.track.artist
                  ? ` — ${snapshot.playback.track.artist}`
                  : ""
              }`
            : ""}
        </text>
        {snapshot.playback.error ? (
          <text fg={colors.error}> {snapshot.playback.error}</text>
        ) : null}
        <box flexGrow={1} />
        <text fg={colors.muted}>space play/pause s stop</text>
      </box>
      {paletteOpen ? (
        <CommandPalette index={paletteIndex} colors={colors} />
      ) : null}
    </box>
  )
}

const App = () => {
  const { width = 100, height = 24 } = useTerminalDimensions()
  const [state, setState] = useState<AppState>({
    kind: "loading",
    path: configPath,
  })
  const colors = resolveTheme(defaultThemeConfig, "dark").colors
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
      <box
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        backgroundColor={colors.background}
      >
        <text fg={colors.error}>Need a terminal at least 60x16.</text>
      </box>
    )
  }
  if (state.kind === "loading")
    return (
      <box
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        backgroundColor={colors.background}
      >
        <text fg={colors.accent}>Loading SpotUI...</text>
      </box>
    )
  if (state.kind === "login") {
    return (
      <LoginScreen
        path={state.path}
        message={state.message}
        colors={colors}
        onAuthorized={onAuthorized}
      />
    )
  }
  if (state.kind === "error")
    return (
      <ErrorScreen path={state.path} message={state.message} colors={colors} />
    )
  return (
    <BridgeView
      bridge={state.bridge}
      colors={colors}
      onAuthorized={onAuthorized}
    />
  )
}

const BridgeView = ({
  bridge,
  colors,
  onAuthorized,
}: {
  readonly bridge: ReturnType<typeof createLiveBridge>
  readonly colors: ColorPalette
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
  if (snapshot.auth === "error")
    return (
      <LoginScreen
        path={configPath.path}
        message={snapshot.authError ?? "Authorization required."}
        colors={colors}
        onAuthorized={onAuthorized}
      />
    )
  if (snapshot.auth !== "ready")
    return (
      <box
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        backgroundColor={colors.background}
      >
        <text fg={colors.accent}>Authorizing Spotify...</text>
      </box>
    )
  return <ReadyScreen bridge={bridge} snapshot={snapshot} colors={colors} />
}

const renderer = await createCliRenderer({
  screenMode: "alternate-screen",
  exitOnCtrlC: false,
})
createRoot(renderer).render(<App />)
