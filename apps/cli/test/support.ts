/** Kernel options for the app's tests: the built-in plugins, and reloads fed by the test. */

import { Effect, Option, type Path, type Queue, Stream } from "effect";
import { ChildProcess } from "effect/process";

import type { BootOptions, ReloadMode, ReloadOptions } from "@liminal/kernel";
import type { GraphMember } from "@liminal/sdk";

import { pluginsFolder, sharedModules } from "../src/boot.ts";

/** The built-in plugins, and the test's own in `extra`, with the parts in `parts`. */
export const bootOptions = (
  path: Path.Path,
  options: { readonly extra?: ReadonlyArray<string>; readonly parts?: BootOptions["parts"] } = {},
): BootOptions => ({
  folders: [pluginsFolder(path), ...(options.extra ?? [])],
  shared: sharedModules,
  parts: options.parts ?? [],
});

/** Reloads that check each batch of files the test offers, with no typecheck, under `mode`. */
export const testReload = (
  changes: Queue.Queue<ReadonlyArray<string>>,
  mode: ReloadMode = "automatic",
): ReloadOptions => ({
  changes: Stream.fromQueue(changes),
  restartRoots: [],
  typecheck: Option.none(),
  startCheck: ChildProcess.make("/bin/sh", ["-c", "exit 0"]),
  mode: () => Effect.succeed(mode),
});

/** Runs `trigger`, then waits for a graph where plugin `name` has a build other than before. */
export const awaitRebuild = Effect.fn("awaitRebuild")(function* <E>(
  graph: Stream.Stream<ReadonlyArray<GraphMember>>,
  name: string,
  trigger: Effect.Effect<void, E>,
) {
  const buildOf = (members: ReadonlyArray<GraphMember>) =>
    members.find((member) => member.name === name)?.build;

  const first = yield* Stream.runHead(graph).pipe(Effect.flatMap(Effect.fromOption));
  const before = buildOf(first);
  yield* trigger;

  yield* graph.pipe(
    Stream.filter((members) => buildOf(members) !== before),
    Stream.runHead,
  );
});
