/** The `read` tool. */
import { Effect, FileSystem, Layer, Path } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { Tools } from "@shanepadgett/liminal-tools/contract";

import { makeRead } from "./read.ts";

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* (yield* Tools).add(yield* makeRead);
  }),
);

export default definePlugin({
  name: "tools-read",
  provides: [],
  requires: [Tools, Directories, FileSystem.FileSystem, Path.Path],
  layer,
});
