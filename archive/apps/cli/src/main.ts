#!/usr/bin/env bun
/**
 * Liminal command-line entry point: starts the kernel over the built-in plugins, loads their TUI
 * parts and draws them in the terminal until the user quits. Exits with the restart code when
 * changed app code is ready, so the supervisor starts it again; what the TUI's parts keep goes to
 * the next process in the handoff file. With `--print`, runs one prompt without the TUI and prints
 * the reply. With `--check`, only starts the kernel and exits 0, which checks that changed code
 * boots. `--model` holds for this run only; `--session` picks the session to open.
 */

import { tmpdir } from "node:os";

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Deferred, Effect, Layer, Option, Path } from "effect";

import { type Handoff, startFrontend } from "@liminal/frontend";
import { start } from "@liminal/kernel";
import { Directories, LaunchSettings, type ModelRef, SessionId } from "@liminal/sdk";

import { Launch, runArgs } from "./args.ts";
import { pluginFolders, sharedModules } from "./boot.ts";
import { compositionSource, projectTrust } from "./composition.ts";
import { giveHandoff, handoffVariable, takeHandoff } from "./handoff.ts";
import { printTurn } from "./print.ts";
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
      temp: path.join(tmpdir(), "liminal"),
    };
  }),
);

/** Starts the kernel with no frontend and no reloads, then stops. */
const check = Effect.gen(function* () {
  yield* start({ composition: yield* compositionSource, shared: sharedModules, parts: ["tui"] });

  return 0;
});

/** `--model` as the agent loop's model for this run. */
const launchSettings = (model: Option.Option<ModelRef>) =>
  LaunchSettings.of({
    sections: Option.match(model, {
      onNone: () => ({}),
      onSome: (ref) => ({ "agent-loop": { model: { provider: ref.provider, id: ref.id } } }),
    }),
  });

/**
 * Runs `prompt` on `session`, or on a new session whose id goes to stderr so a later run can
 * continue it.
 */
const print = Effect.fn("print")(function* (prompt: string, chosen: Option.Option<SessionId>) {
  const kernel = yield* start({
    composition: yield* compositionSource,
    shared: sharedModules,
    parts: [],
  });

  const session = Option.getOrElse(chosen, () => SessionId.make(crypto.randomUUID()));

  if (Option.isNone(chosen)) yield* Console.error(`session ${session}`);

  return yield* printTurn(kernel.connect, { session, prompt }).pipe(
    Effect.catch((error) => Effect.as(Console.error(error), 1)),
  );
});

/** The previous process's handoff; else, with `--session`, that session for chat to open. */
const handoffOf = (file: Option.Option<string>, session: Option.Option<SessionId>) =>
  Effect.map(
    Option.match(file, { onNone: () => Effect.succeed<Handoff>({}), onSome: takeHandoff }),
    (handed): Handoff =>
      Object.keys(handed).length > 0 || Option.isNone(session)
        ? handed
        : { "chat/session": session.value },
  );

/** Runs the TUI until the user quits (0) or a restart applies (the restart code). */
const tui = Effect.fn("tui")(function* (session: Option.Option<SessionId>) {
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
    handoff: yield* handoffOf(handoffFile, session),
  });

  const restart = Effect.andThen(
    Option.match(handoffFile, {
      onNone: () => Effect.void,
      onSome: (file) => Effect.suspend(() => giveHandoff(file, frontend.handoff())),
    }),
    Effect.succeed(restartExitCode),
  );

  return yield* Effect.raceFirst(
    mount(frontend, terminal).pipe(Effect.flatMap(Deferred.await), Effect.as(0)),
    kernel.reloads.restartDue.pipe(Effect.andThen(restart)),
  );
});

const main = runArgs(process.argv.slice(2), (launch) =>
  Effect.scoped(
    Launch.$match(launch, {
      Check: () => Effect.provideService(check, LaunchSettings, launchSettings(Option.none())),
      Print: ({ prompt, session, model }) =>
        Effect.provideService(print(prompt, session), LaunchSettings, launchSettings(model)),
      Tui: ({ session, model }) =>
        Effect.provideService(tui(session), LaunchSettings, launchSettings(model)),
    }),
  ),
);

BunRuntime.runMain(
  main.pipe(
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the CLI's entry point.
    Effect.provide(
      projectTrust.pipe(Layer.provideMerge(directories), Layer.provideMerge(BunServices.layer)),
    ),
  ),
  { teardown: exitWithCode },
);
