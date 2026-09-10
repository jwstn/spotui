import type { LibraryCollection } from "./domain"

export type CommandId =
  | "go-playlists"
  | "go-saved-tracks"
  | "go-saved-albums"
  | "go-followed-artists"
  | "back"
  | "open"
  | "refresh"
  | "load-more"
  | "quit"

export interface CommandDefinition {
  readonly id: CommandId
  readonly title: string
  readonly shortcut?: string
}

export const commandDefinitions: readonly CommandDefinition[] = [
  { id: "go-playlists", title: "Go to playlists", shortcut: "1" },
  { id: "go-saved-tracks", title: "Go to saved tracks", shortcut: "2" },
  { id: "go-saved-albums", title: "Go to saved albums", shortcut: "3" },
  { id: "go-followed-artists", title: "Go to followed artists", shortcut: "4" },
  { id: "back", title: "Go back", shortcut: "b" },
  { id: "open", title: "Open selected item", shortcut: "enter" },
  { id: "refresh", title: "Refresh current view", shortcut: "r" },
  { id: "load-more", title: "Load more", shortcut: "n" },
  { id: "quit", title: "Quit", shortcut: "q" },
]

const collections: Partial<Record<CommandId, LibraryCollection>> = {
  "go-playlists": "playlists",
  "go-saved-tracks": "saved-tracks",
  "go-saved-albums": "saved-albums",
  "go-followed-artists": "followed-artists",
}

export interface CommandBridge {
  readonly selectCollection: (collection: LibraryCollection) => void
  readonly back: () => void
  readonly openSelected: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly loadMore: () => Promise<void>
}

export const dispatchCommand = async (bridge: CommandBridge, id: CommandId) => {
  const collection = collections[id]
  if (collection) return bridge.selectCollection(collection)
  if (id === "back") return bridge.back()
  if (id === "open") return bridge.openSelected()
  if (id === "refresh") return bridge.refresh()
  if (id === "load-more") return bridge.loadMore()
  if (id === "quit") return process.exit(0)
}
