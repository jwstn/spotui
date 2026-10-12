import { ConsolePosition, createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { KeymapProvider } from "@opentui/keymap/react"
import { setTuiSuspender } from "#/tuiSuspension"

import App from "#/App"

process.env.OTUI_USE_ALTERNATE_SCREEN = "true"

const FOCUS_REPORTING_ENABLE = "\x1b[?1004h"
const FOCUS_REPORTING_DISABLE = "\x1b[?1004l"
const FULL_SCREEN_REPAINT = "\x1b[2J\x1b[3J\x1b[H"

const SYSTEM_THEME_READ_TIMEOUT_MS = 500

const renderer = await createCliRenderer({
  screenMode: "alternate-screen",
  exitOnCtrlC: false,
  externalOutputMode: "passthrough",
  onDestroy: () => {
    process.stdout.write(FOCUS_REPORTING_DISABLE)
    process.exit(0)
  },
  consoleMode: "console-overlay",
  consoleOptions: {
    position: ConsolePosition.BOTTOM,
    sizePercent: 15,
  },
})

const keymap = createDefaultOpenTuiKeymap(renderer)

console.log(keymap)
renderer.console.show()

setTuiSuspender({
  suspend: () => {
    process.stdout.write(FOCUS_REPORTING_DISABLE)
    renderer.suspend()
  },
  resume: () => {
    renderer.resume()
    process.stdout.write(FOCUS_REPORTING_ENABLE)
    process.stdout.write(FULL_SCREEN_REPAINT)
    renderer.requestRender()
  },
})

// const systemThemeReloader = createSystemThemeReloader({
//   readPalette: (timeoutMs) => {
//     renderer.clearPaletteCache()
//     return renderer.getPalette({ timeout: timeoutMs, size: 16 })
//   },
//   applyColors: (terminalColors) => {
//     setSystemThemeColors(terminalColors)
//     renderer.setBackgroundColor(colors.background)
//   },
//   notify: () => notifySystemThemeReload(),
//   isAutoReloadEnabled: () => Effect.runPromise(loadStoredSystemThemeAutoReload),
//   setTimer: (fn, ms) => globalThis.setTimeout(fn, ms),
//   clearTimer: (handle) =>
//     globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
//   delay: (ms) =>
//     new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms)),
//   config: { readTimeoutMs: SYSTEM_THEME_READ_TIMEOUT_MS },
//   onEvent: logReloadEvent,
// })

function Bootstrap() {
  return (
    <KeymapProvider keymap={keymap}>
      <App />
    </KeymapProvider>
  )
}

createRoot(renderer).render(<Bootstrap />)
