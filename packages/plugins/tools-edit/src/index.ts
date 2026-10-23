/** The `edit` tool. */
import { Effect, FileSystem, Layer, Path } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { SessionLog } from "@shanepadgett/liminal-session/contract";
import { Tools } from "@shanepadgett/liminal-tools/contract";

import { makeEdit } from "./edit.ts";

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* (yield* Tools).add(yield* makeEdit);
  }),
);

export default definePlugin({
  name: "tools-edit",
  provides: [],
  requires: [Tools, Directories, SessionLog, FileSystem.FileSystem, Path.Path],
  layer,
  entries: { tui: () => import("./tui/index.tsx") },
});
