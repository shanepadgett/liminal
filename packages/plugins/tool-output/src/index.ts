/**
 * Long tool output: a result whose text is past the limits keeps its first and last halves, and the
 * whole text is saved to a private file in the system temp folder, which the model can read.
 */
import { tmpdir } from "node:os";

import { Clock, Duration, Effect, FileSystem, Layer, Option, Path } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import type { ToolResult } from "@shanepadgett/liminal-model/contract";
import type { SessionId } from "@shanepadgett/liminal-session/contract";
import { ToolCall } from "@shanepadgett/liminal-tools/contract";

import { cutText, isLong } from "./cut.ts";

const PRIVATE_FOLDER = 0o700;

const PRIVATE_FILE = 0o600;

/** A session's saved output is removed this long after its folder last changed. */
const KEPT_FOR = Duration.days(7);

const textOf = (result: ToolResult) =>
  result.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.join(tmpdir(), "liminal-tool-output");

  /** Writes `text` to the session's file for `callId` and returns its path. */
  const save = Effect.fn("ToolOutput.save")(function* (
    session: SessionId,
    callId: string,
    text: string,
  ) {
    const folder = path.join(root, encodeURIComponent(session));
    yield* fs.makeDirectory(folder, { recursive: true, mode: PRIVATE_FOLDER });

    const file = path.join(folder, `${encodeURIComponent(callId)}.txt`);
    yield* fs.writeFileString(file, text, { mode: PRIVATE_FILE });

    return file;
  });

  /** `result` with its text cut, the images after it; a short result as it is. */
  const fit = (session: SessionId, result: ToolResult) => {
    const text = textOf(result);
    if (!isLong(text)) return Effect.succeed(result);

    const images = result.content.flatMap((part) => (part.type === "image" ? [part] : []));

    return save(session, result.callId, text).pipe(
      Effect.map((file) => `Whole output: ${file}; read it with offset.`),
      Effect.catch((error) =>
        Effect.succeed(`The whole output could not be saved: ${error.message}`),
      ),
      Effect.map((where): ToolResult => ({
        ...result,
        content: [{ type: "text", text: cutText(text, where) }, ...images],
      })),
    );
  };

  /** Removes the session folders that have not changed for `KEPT_FOR`. */
  const sweep = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const cutoff = now - Duration.toMillis(KEPT_FOR);
    const folders = yield* fs.readDirectory(root);

    yield* Effect.forEach(folders, (name) =>
      Effect.gen(function* () {
        const folder = path.join(root, name);
        const { mtime } = yield* fs.stat(folder);

        const changed = Option.getOrElse(
          Option.map(mtime, (date) => date.getTime()),
          () => now,
        );

        if (changed < cutoff) yield* fs.remove(folder, { recursive: true });
      }).pipe(Effect.ignore),
    );
  }).pipe(Effect.ignore);

  return { fit, sweep };
});

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { fit, sweep } = yield* make;
    yield* sweep;

    yield* (yield* ToolCall).wrap((request, next) =>
      Effect.flatMap(next(request), (result) => fit(request.session, result)),
    );
  }),
);

export default definePlugin({
  name: "tool-output",
  provides: [],
  requires: [ToolCall, FileSystem.FileSystem, Path.Path],
  layer,
});
