#!/usr/bin/env bun
/**
 * Liminal command-line entry point: starts the kernel over the built-in plugins, loads their TUI
 * parts and draws them in the terminal until the user quits.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer, Path } from "effect";

import { startFrontend } from "@liminal/frontend";
import { start } from "@liminal/kernel";
import { Directories } from "@liminal/sdk";
import { TuiHost } from "@liminal/sdk/tui";

import { runTui } from "./tui/run.tsx";

const directories = Layer.effect(
  Directories,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const global = path.join(process.env["HOME"] ?? ".", ".liminal");

    return {
      global,
      project: path.join(process.cwd(), ".liminal"),
      data: path.join(global, "data"),
    };
  }),
);

const main = Effect.gen(function* () {
  const path = yield* Path.Path;

  const kernel = yield* start({
    folders: [path.resolve(import.meta.dir, "../../../packages/plugins")],
  });

  const frontend = yield* startFrontend({
    graph: kernel.graph,
    connect: kernel.connect,
    host: TuiHost,
    part: (member) => member.plugin.tui,
  });

  yield* runTui(frontend);
});

BunRuntime.runMain(
  main.pipe(
    Effect.scoped,
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the CLI's entry point.
    Effect.provide(directories.pipe(Layer.provideMerge(BunServices.layer))),
  ),
);
