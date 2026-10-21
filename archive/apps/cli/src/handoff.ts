/**
 * The handoff file: what the TUI's parts keep, written when the app exits to restart and read by
 * the process the supervisor starts next. The supervisor names the file in
 * {@link handoffVariable}.
 */

import { Effect, FileSystem, Option, Schema } from "effect";

import type { Handoff } from "@liminal/frontend";

/** The environment variable that names the handoff file. */
export const handoffVariable = "LIMINAL_HANDOFF";

const HandoffJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json));

/**
 * The handoff in `file`, which it removes so a later start begins blank. Empty when there is none
 * or it does not decode.
 */
export const takeHandoff = Effect.fn("takeHandoff")(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(file))) return {};
  const text = yield* fs.readFileString(file);
  yield* fs.remove(file);

  return Option.getOrElse(Schema.decodeOption(HandoffJson)(text), (): Handoff => ({}));
});

/** Writes `handoff` to `file` for the next process. */
export const giveHandoff = Effect.fn("giveHandoff")(function* (file: string, handoff: Handoff) {
  const fs = yield* FileSystem.FileSystem;

  yield* fs.writeFileString(file, yield* Schema.encodeEffect(HandoffJson)(handoff));
});
