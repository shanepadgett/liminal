/** The supervisor starts the app again after a restart exit and ends with any other exit code. */

import { expect } from "bun:test";

import { Effect, FileSystem, Path } from "effect";
import { ChildProcess } from "effect/process";

import { Directories } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { restartExitCode, supervise } from "../src/supervisor.ts";

effectTest(
  "a restart exit runs the child again; any other code ends supervision",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const runs = path.join((yield* Directories).data, "runs");

    const script = [
      `echo run >> "${runs}"`,
      `if [ "$(wc -l < "${runs}")" -lt 3 ]; then exit ${restartExitCode}; fi`,
      "exit 3",
    ].join("\n");

    const code = yield* supervise(ChildProcess.make("/bin/sh", ["-c", script]));

    expect<number>(code).toBe(3);
    expect((yield* fs.readFileString(runs)).trim().split("\n")).toHaveLength(3);
  }),
  testBaseServices,
);
