/**
 * The TUI's log: warnings and errors, one JSON line each, in a file per run under
 * `~/.liminal/logs`. A file is written only once something is logged, stops at a size cap, and old
 * files go at the next start, so the logs stay small.
 */
import {
  Clock,
  Config,
  Effect,
  FileSystem,
  Layer,
  Logger,
  Option,
  Path,
  Ref,
  References,
} from "effect";

/** Past this many bytes, a run's file gets one last line and nothing more. */
const MAX_BYTES = 5 * 1024 * 1024;

/** The newest files kept at start. */
const KEEP_FILES = 20;

/** Files older than this go at start. */
const KEEP_FOR = 7 * 24 * 60 * 60 * 1000;

const FILE_PREFIX = "tui-";

const FILE_SUFFIX = ".log";

const encoder = new TextEncoder();

/** This run's file name: its start time, such as `tui-2026-10-24T10-15-03.log`. */
const fileNameAt = (now: number) =>
  `${FILE_PREFIX}${new Date(now).toISOString().slice(0, 19).replaceAll(":", "-")}${FILE_SUFFIX}`;

const isLogFile = (name: string) => name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX);

/** Deletes files older than `KEEP_FOR`, then all but the newest `KEEP_FILES`. */
const prune = Effect.fn("logs.prune")(function* (folder: string, now: number) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = (yield* fs.readDirectory(folder)).filter(isLogFile);

  const files = yield* Effect.forEach(names, (name) =>
    Effect.map(fs.stat(path.join(folder, name)), (info) => ({
      at: path.join(folder, name),
      changed: Option.match(info.mtime, { onNone: () => 0, onSome: (date) => date.getTime() }),
    })),
  );

  const newest = files.toSorted((a, b) => b.changed - a.changed);
  const kept = new Set(newest.filter((file) => now - file.changed < KEEP_FOR).slice(0, KEEP_FILES));
  const dropped = newest.filter((file) => !kept.has(file));

  yield* Effect.forEach(dropped, (file) => fs.remove(file.at), { discard: true });
});

/** The line that ends a file at the cap. */
const limitLine = (now: number) =>
  JSON.stringify({
    message: "log limit reached; later entries dropped",
    level: "WARN",
    timestamp: new Date(now).toISOString(),
  });

/** Appends each batch of lines to `file` until `MAX_BYTES`, then the limit line once. */
const makeFlush = Effect.fn("logs.makeFlush")(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const written = yield* Ref.make(0);

  return (lines: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const before = yield* Ref.get(written);
      if (before >= MAX_BYTES) return;

      const text = `${lines.join("\n")}\n`;
      const after = before + encoder.encode(text).length;
      const ending = after >= MAX_BYTES ? `${limitLine(yield* Clock.currentTimeMillis)}\n` : "";

      yield* Ref.set(written, after);
      yield* fs.writeFileString(file, text + ending, { flag: "a" });
    }).pipe(Effect.ignore);
});

/** A logger writing this run's file; making the folder or pruning may fail and logging goes on. */
const fileLogger = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = path.join(yield* Config.String("HOME"), ".liminal", "logs");
  const now = yield* Clock.currentTimeMillis;

  yield* fs
    .makeDirectory(folder, { recursive: true })
    .pipe(Effect.andThen(prune(folder, now)), Effect.ignore);

  const flush = yield* makeFlush(path.join(folder, fileNameAt(now)));

  return yield* Logger.batched(Logger.formatJson, {
    window: "1 second",
    flush: (lines) => flush(lines),
  });
});

/** The TUI's only logger, for warnings and errors. */
export const tuiLogs = Layer.mergeAll(
  Logger.layer([fileLogger]),
  Layer.succeed(References.MinimumLogLevel, "Warn"),
);
