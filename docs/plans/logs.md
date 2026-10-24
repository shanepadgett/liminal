# Plan: TUI logs

Warnings and errors the TUI shows or hits go to a log file that a person or an agent can read later, and the files stay small.

## Today

| Piece | Today |
| --- | --- |
| Notifications | `Notifications.post` in `packages/tui/src/notifications.ts` draws a note for 5 seconds and keeps nothing. |
| Failed TUI work | `logged` in `packages/tui/src/bridge.ts` calls `Effect.logError`, as plugins' own `logWarning` and `logError` do. |
| Where logs go | Effect's default logger writes to the console. Inside the TUI, OpenTUI captures console output, so every log is lost. |
| Turn notices | Retry warnings and stopped turns are session events in SQLite; they stay with the session. |

## How others do it

| Harness | Hygiene |
| --- | --- |
| Crush | One `crush.log`, rotated at 10 MB, rotated files deleted after 30 days (`internal/log/log.go`, lumberjack). |
| OpenCode desktop | Files per scope; files older than 7 days deleted at start (`desktop/src/main/native/logging.ts`). |

Effect ships `Logger.toFile(logger, path, { flag, batchWindow })`: a scoped logger that batches lines and appends them to a file, flushing when the scope closes. `References.MinimumLogLevel` drops entries below a level before any logger sees them.

## Design

The TUI's process writes its own log; the host decides where logs go, so it lives in `apps/cli`, not in a plugin. A plugin layer cannot set the logger for other plugins' fibers.

| Rule | Value | Why |
| --- | --- | --- |
| Folder | `~/.liminal/logs/` | Next to the other user-wide files. |
| One file per run | `tui-<start time>.log`, such as `tui-2026-10-24T10-15-03.log` | "What went wrong just now" is the newest file; pruning is deleting whole files. |
| Level | Warning and above | Info and debug are what make logs huge. Today the code has 19 files logging warnings or errors and one debug line, a failed approval classifier, which falls back to review anyway. |
| Format | JSON lines (`Logger.formatJson`): time, level, message, cause, annotations | One entry per line; `jq` and an agent read it, a person can too. A cause's stack stays inside its line. |
| Size cap | 5 MB per file | A loop that fails every second cannot fill the disk. At the cap the file gets one last line, `log limit reached; later entries dropped`, and the run writes nothing more. |
| Pruning | At start, delete empty files and files older than 7 days, then keep the newest 20 | Bounded by count and age; a clean run leaves no file behind. |
| Secrets | Nothing logs credentials | Errors carry messages and causes, never request headers. The rule goes in the `accounts` README. |

Notifications: `post` also logs `warning` and `error` notifications at that level, title and message, annotated `notification`. `info` and `success` stay on screen only.

Print mode, `connect` and `logout` keep today's logging; this plan is the TUI only.

## Code

```ts
// apps/cli/src/logs.ts
const LOG_FOLDER = ".liminal/logs"   // under HOME, as directories' `global`
const MAX_BYTES = 5 * 1024 * 1024
const KEEP_FILES = 20
const KEEP_DAYS = 7

/** Deletes empty and old files, then all but the newest KEEP_FILES. */
const prune: (folder: string) => Effect<void, never, FileSystem | Path>

/** formatJson, cut off at MAX_BYTES with one last line. */
const capped: (format: Logger<unknown, string>) => Logger<unknown, string>

/** The TUI's logger: prunes, opens this run's file, warning and above. */
export const tuiLogs: Layer<never, never, FileSystem | Path>
  = Layer.mergeAll(
      Logger.layer([Effect.andThen(prune(folder), Logger.toFile(capped(Logger.formatJson), file))]),
      Layer.succeed(References.MinimumLogLevel, "Warn"),
    )

// apps/cli/src/tui.ts
run(plugins).pipe(Effect.provide(host), Effect.provide(tuiLogs), Effect.provide(BunServices.layer))

// packages/tui/src/notifications.ts
const post = (notification) => {
  ...
  if (notification.kind === "warning" || notification.kind === "error") fork(logOf(notification))
}
```

The file is created on the first entry, not at start, so a clean run leaves nothing; if `Logger.toFile` opens the file at once, `prune` deletes the empty file on the next start instead.

## Steps

1. [x] `apps/cli/src/logs.ts` and the TUI wiring. The logger is `Logger.batched` over `Logger.formatJson`, appending to the file each second, so the file appears with the first entry.
2. [x] Notifications log warnings and errors.
3. [ ] Prove it: run `/commit` with Sol selected; its warning shows in the newest file.
4. [x] `docs/usage/cli.md` says where the logs are; `docs/status.md` drops the Later item.
