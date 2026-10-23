/** `shell`'s `tui` entry: its transcript row, labelled by the call's description. */
import { Effect, Layer } from "effect";

import { ToolRows } from "@shanepadgett/liminal-chat/tui";
import { definePlugin } from "@shanepadgett/liminal-core";

import { shellName } from "../contract.ts";
import { ShellRow } from "./ShellRow.tsx";

const make = Effect.gen(function* () {
  yield* (yield* ToolRows).add({ tool: shellName, component: ShellRow });
});

export default definePlugin({
  name: "tools-shell-tui",
  provides: [],
  requires: [ToolRows],
  layer: Layer.effectDiscard(make),
});
