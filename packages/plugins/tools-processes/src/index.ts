/** The process tools: commands that keep running in a terminal while the model works. */
import { Effect, Layer } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { Tools } from "@shanepadgett/liminal-tools/contract";

import { makeProcesses } from "./processes.ts";
import { processTools } from "./tools.ts";

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { workspace } = yield* Directories;
    const tools = yield* Tools;
    // The plugin's scope closes when Liminal exits, and stops every process with it.
    const processes = yield* makeProcesses(yield* Effect.scope, workspace);

    yield* Effect.forEach(processTools(processes), (tool) => tools.add(tool), { discard: true });
  }),
);

export default definePlugin({
  name: "tools-processes",
  provides: [],
  requires: [Tools, Directories],
  layer,
  entries: { tui: () => import("./tui/index.tsx") },
});
