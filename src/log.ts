import { Logger } from "effect"
import { appendFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export const logFilePathFor = (configPath: string) =>
  join(dirname(configPath), "spotui.log")

/**
 * A Logger that appends Effect.log output to a file. The TUI owns the
 * terminal, so stdout diagnostics are normally invisible.
 */
export const fileLoggerLive = (path: string) =>
  Logger.layer([
    Logger.make((options) => {
      const line = `${new Date(options.date).toISOString()} ${options.message}\n`
      void appendFile(path, line).catch(() => undefined)
    }),
  ])
