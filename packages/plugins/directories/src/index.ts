/** The folders from `HOME` and the folder Liminal starts in. */
import { Config, Effect, Layer, Path } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";

import { Directories } from "./contract.ts";

const make = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String("HOME");
  const workspace = path.resolve(".");

  return Directories.of({
    global: path.join(home, ".liminal"),
    workspace,
    project: path.join(workspace, ".liminal"),
  });
});

export default definePlugin({
  name: "directories",
  provides: [Directories],
  requires: [Path.Path],
  layer: Layer.effect(Directories, make),
});
