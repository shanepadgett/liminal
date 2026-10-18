#!/usr/bin/env bun
/**
 * Liminal command-line entry point: starts the kernel over the built-in plugins, loads their TUI
 * parts and draws them in the terminal until the user quits. Exits with the restart code when
 * changed app code is ready, so the supervisor starts it again; what the TUI's parts keep goes to
 * the next process in the handoff file. With `--check`, only starts the kernel and exits 0, which
 * checks that changed code boots.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Deferred, Effect, Layer, Option, Path } from "effect";

import { startFrontend } from "@liminal/frontend";
import { start } from "@liminal/kernel";
import { Directories } from "@liminal/sdk";

import { pluginFolders, sharedModules } from "./boot.ts";
import { compositionSource, projectTrust } from "./composition.ts";
import { giveHandoff, handoffVariable, takeHandoff } from "./handoff.ts";
import { reloadOptions } from "./reload.ts";
import { exitWithCode, restartExitCode } from "./supervisor.ts";
import { makeTerminal, mount, openRenderer, tuiServices } from "./tui/run.tsx";

const directories = Layer.effect(
  Directories,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = process.env["HOME"] ?? ".";
    const global = path.join(home, ".liminal");

    return {
      home,
      global,
      workspace: process.cwd(),
      project: path.join(process.cwd(), ".liminal"),
      data: path.join(global, "data"),
    };
  }),
);

/** Starts the kernel with no frontend and no reloads, then stops. */
const check = Effect.gen(function* () {
  yield* start({ composition: yield* compositionSource, shared: sharedModules, parts: ["tui"] });

  return 0;
});

/** Runs the TUI until the user quits (0) or a restart applies (the restart code). */
const run = Effect.gen(function* () {
  const kernel = yield* start({
    composition: yield* compositionSource,
    shared: sharedModules,
    parts: ["tui"],
    reload: yield* reloadOptions(yield* pluginFolders),
  });

  const terminal = yield* makeTerminal(yield* openRenderer);
  const handoffFile = Option.fromNullishOr(process.env[handoffVariable]);

  const frontend = yield* startFrontend({
    graph: kernel.graph,
    connect: kernel.connect,
    services: tuiServices(terminal),
    part: (member) => member.parts.tui,
    handoff: yield* Option.match(handoffFile, {
      onNone: () => Effect.succeed({}),
      onSome: takeHandoff,
    }),
  });

  const restart = Effect.andThen(
    Option.match(handoffFile, {
      onNone: () => Effect.void,
      onSome: (file) => giveHandoff(file, frontend.handoff()),
    }),
    Effect.succeed(restartExitCode),
  );

  return yield* Effect.raceFirst(
    mount(frontend, terminal).pipe(Effect.flatMap(Deferred.await), Effect.as(0)),
    kernel.reloads.restartDue.pipe(Effect.andThen(restart)),
  );
});

const main = process.argv.includes("--check") ? check : run;

BunRuntime.runMain(
  main.pipe(
    Effect.scoped,
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the CLI's entry point.
    Effect.provide(
      projectTrust.pipe(Layer.provideMerge(directories), Layer.provideMerge(BunServices.layer)),
    ),
  ),
  { teardown: exitWithCode },
);
