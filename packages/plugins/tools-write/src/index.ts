/** The `write` tool. */
import { Effect, FileSystem, Layer, Path } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { SessionLog } from "@shanepadgett/liminal-session/contract";
import { Tools } from "@shanepadgett/liminal-tools/contract";

import { makeWrite } from "./write.ts";

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* (yield* Tools).add(yield* makeWrite);
  }),
);

export default definePlugin({
  name: "tools-write",
  provides: [],
  requires: [Tools, Directories, SessionLog, FileSystem.FileSystem, Path.Path],
  layer,
  entries: { tui: () => import("./tui/index.tsx") },
});
