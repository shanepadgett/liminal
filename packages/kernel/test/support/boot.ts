/** Kernel options for tests: shared modules, a locked plugin set, or reloads fed by the test. */

import { Effect, Option, Queue, Stream } from "effect";
import { ChildProcess } from "effect/process";

import type { ReloadState } from "@liminal/sdk";

import type { BootOptions, Kernel, ReloadOptions } from "../../src/index.ts";

/** A locked plugin set over `folders`; fixtures import `effect` and `@liminal/sdk` bare. */
export const testBoot = (folders: ReadonlyArray<string>): BootOptions => ({
  folders,
  shared: { from: import.meta.dir, packages: ["effect", "@liminal/sdk"] },
  parts: [],
});

/** Reloads fed by the returned queue: no typecheck, a start check that passes, automatic mode. */
export const testReload = Effect.fn("testReload")(function* (
  overrides: Partial<Omit<ReloadOptions, "changes">> = {},
) {
  const changes = yield* Queue.unbounded<ReadonlyArray<string>>();

  const reload: ReloadOptions = {
    changes: Stream.fromQueue(changes),
    restartRoots: [],
    typecheck: Option.none(),
    startCheck: ChildProcess.make("/bin/sh", ["-c", "exit 0"]),
    mode: () => Effect.succeed("automatic"),
    ...overrides,
  };

  return { reload, changes };
});

/** Waits for a reload state `matches` accepts, and returns it. */
export const awaitState = (kernel: Kernel, matches: (state: ReloadState) => boolean) =>
  kernel.reloads.state.pipe(
    Stream.filter(matches),
    Stream.runHead,
    Effect.flatMap(Effect.fromOption),
    Effect.orDie,
  );
