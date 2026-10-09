export type CommandId =
  | "back"
  | "open"
  | "refresh"
  | "load-more"
  | "toggle-play"
  | "next-track"
  | "previous-track"
  | "stop"
  | "quit"
  | "moveUp"
  | "moveDown"

export interface CommandBridge {
  readonly back: () => void
  readonly openSelected: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly loadMore: () => Promise<void>
  readonly togglePlayback: () => Promise<void>
  readonly nextTrack: () => Promise<void>
  readonly previousTrack: () => Promise<void>
  readonly stopPlayback: () => Promise<void>
  readonly moveSelection: (value: number) => Promise<void>
}

export const dispatchCommand = async (bridge: CommandBridge, id: CommandId) => {
  if (id === "back") return bridge.back()
  if (id === "open") return bridge.openSelected()
  if (id === "refresh") return bridge.refresh()
  if (id === "load-more") return bridge.loadMore()
  if (id === "toggle-play") return bridge.togglePlayback()
  if (id === "next-track") return bridge.nextTrack()
  if (id === "previous-track") return bridge.previousTrack()
  if (id === "stop") return bridge.stopPlayback()
  if (id === "moveUp") return bridge.moveSelection(-1)
  if (id === "moveDown") return bridge.moveSelection(1)
}

export const commandBindingDefinitions = [
  { key: "q", cmd: "app.quit", title: "Quit" },
  { key: "escape", cmd: "app.openPallette", title: "openPallette" },
  { key: "r", cmd: "app.reload", title: "reload" },
  { key: "n", cmd: "app.load-more", title: "load more" },
  { key: "space", cmd: "app.toggle-player", title: "toggle player" },
  { key: "s", cmd: "app.stop", title: "stop" },
  { key: "backspace", cmd: "app.back", title: "back" },
  { key: "ctrl+p", cmd: "app.commandPalette", title: "commandPalette" },
  { key: "up", cmd: "app.moveUp", title: "moveUp" },
  { key: "down", cmd: "app.moveDown", title: "moveDown" },
  { key: "enter", cmd: "app.open", title: "open" },
]
