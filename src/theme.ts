export type ThemeId =
  | "system"
  | "ghui"
  | "tokyo-night"
  | "catppuccin"
  | "catppuccin-latte"
  | "rose-pine"
  | "rose-pine-dawn"
  | "gruvbox"
  | "gruvbox-light"
  | "nord"
  | "dracula"
  | "kanagawa"
  | "one-dark"
  | "one-light"
  | "monokai"
  | "solarized-dark"
  | "solarized-light"
  | "everforest"
  | "vesper"
  | "vague"
  | "ayu"
  | "ayu-mirage"
  | "ayu-light"
  | "github-dark-dimmed"
  | "palenight"
  | "opencode"
  | "cursor"

export type ThemeTone = "dark" | "light"

export interface ColorPalette {
  readonly background: string
  readonly panel: string
  readonly text: string
  readonly muted: string
  readonly separator: string
  readonly accent: string
  readonly selectedBackground: string
  readonly selectedText: string
  readonly error: string
}

export interface ThemeDefinition {
  readonly id: ThemeId
  readonly name: string
  readonly tone: ThemeTone
  readonly colors: ColorPalette
}

export type ThemeConfig =
  | { readonly mode: "fixed"; readonly theme: ThemeId }
  | {
      readonly mode: "system"
      readonly darkTheme: ThemeId
      readonly lightTheme: ThemeId
    }

const ghui: ColorPalette = {
  background: "#111018",
  panel: "#1a1a2e",
  text: "#ede7da",
  muted: "#9f9788",
  separator: "#6f685d",
  accent: "#f4a51c",
  selectedBackground: "#1d2430",
  selectedText: "#f8fafc",
  error: "#f97316",
}

const light: ColorPalette = {
  background: "#f7f4ed",
  panel: "#eee9df",
  text: "#24211d",
  muted: "#716b61",
  separator: "#b6aea0",
  accent: "#a85c00",
  selectedBackground: "#ded8cc",
  selectedText: "#171411",
  error: "#b42318",
}

const definitions: Record<Exclude<ThemeId, "system">, ThemeDefinition> = {
  ghui: { id: "ghui", name: "ghui", tone: "dark", colors: ghui },
  "tokyo-night": {
    id: "tokyo-night",
    name: "Tokyo Night",
    tone: "dark",
    colors: ghui,
  },
  catppuccin: {
    id: "catppuccin",
    name: "Catppuccin",
    tone: "dark",
    colors: ghui,
  },
  "catppuccin-latte": {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    tone: "light",
    colors: light,
  },
  "rose-pine": {
    id: "rose-pine",
    name: "Rose Pine",
    tone: "dark",
    colors: ghui,
  },
  "rose-pine-dawn": {
    id: "rose-pine-dawn",
    name: "Rose Pine Dawn",
    tone: "light",
    colors: light,
  },
  gruvbox: { id: "gruvbox", name: "Gruvbox", tone: "dark", colors: ghui },
  "gruvbox-light": {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    tone: "light",
    colors: light,
  },
  nord: { id: "nord", name: "Nord", tone: "dark", colors: ghui },
  dracula: { id: "dracula", name: "Dracula", tone: "dark", colors: ghui },
  kanagawa: { id: "kanagawa", name: "Kanagawa", tone: "dark", colors: ghui },
  "one-dark": { id: "one-dark", name: "One Dark", tone: "dark", colors: ghui },
  "one-light": {
    id: "one-light",
    name: "One Light",
    tone: "light",
    colors: light,
  },
  monokai: { id: "monokai", name: "Monokai", tone: "dark", colors: ghui },
  "solarized-dark": {
    id: "solarized-dark",
    name: "Solarized Dark",
    tone: "dark",
    colors: ghui,
  },
  "solarized-light": {
    id: "solarized-light",
    name: "Solarized Light",
    tone: "light",
    colors: light,
  },
  everforest: {
    id: "everforest",
    name: "Everforest",
    tone: "dark",
    colors: ghui,
  },
  vesper: { id: "vesper", name: "Vesper", tone: "dark", colors: ghui },
  vague: { id: "vague", name: "Vague", tone: "dark", colors: ghui },
  ayu: { id: "ayu", name: "Ayu", tone: "dark", colors: ghui },
  "ayu-mirage": {
    id: "ayu-mirage",
    name: "Ayu Mirage",
    tone: "dark",
    colors: ghui,
  },
  "ayu-light": {
    id: "ayu-light",
    name: "Ayu Light",
    tone: "light",
    colors: light,
  },
  "github-dark-dimmed": {
    id: "github-dark-dimmed",
    name: "GitHub Dark Dimmed",
    tone: "dark",
    colors: ghui,
  },
  palenight: { id: "palenight", name: "Palenight", tone: "dark", colors: ghui },
  opencode: { id: "opencode", name: "OpenCode", tone: "dark", colors: ghui },
  cursor: { id: "cursor", name: "Cursor", tone: "dark", colors: ghui },
}

export const defaultThemeConfig: ThemeConfig = { mode: "fixed", theme: "ghui" }

export const resolveTheme = (
  config: ThemeConfig,
  systemTone: ThemeTone
): ThemeDefinition => {
  const id =
    config.mode === "fixed"
      ? config.theme
      : systemTone === "dark"
        ? config.darkTheme
        : config.lightTheme
  return id === "system" ? definitions.ghui : definitions[id]
}
