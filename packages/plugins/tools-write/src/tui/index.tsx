/** `write`'s `tui` entry: its transcript row, with the diff a click opens. */
import { Effect, Layer } from "effect";

import { ToolRows } from "@shanepadgett/liminal-chat/tui";
import { definePlugin } from "@shanepadgett/liminal-core";

import { writeName } from "../contract.ts";
import { WriteRow } from "./WriteRow.tsx";

const make = Effect.gen(function* () {
  yield* (yield* ToolRows).add({ tool: writeName, component: WriteRow });
});

export default definePlugin({
  name: "tools-write-tui",
  provides: [],
  requires: [ToolRows],
  layer: Layer.effectDiscard(make),
});
