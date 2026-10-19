/** The checks `/commit` runs: the `check` and `commit` lists, due on the files it will commit. */

import { Effect, Option } from "effect";

import { CommitChecks, type DueChecks } from "../contract.ts";
import { makeChecksFile } from "./file.ts";
import { makeRunner } from "./run.ts";

export const makeCommitChecks = Effect.gen(function* () {
  const { load } = yield* makeChecksFile;
  const { dueChecks, runChecks } = yield* makeRunner;

  const due = Effect.fn("Checks.commitDue")(function* (paths: ReadonlyArray<string>) {
    const checks = yield* load();
    if (Option.isNone(checks)) return { count: 0, run: runChecks([]) } satisfies DueChecks;

    const { check, commit, root } = checks.value;
    const found = yield* dueChecks([...check, ...commit], root, { type: "files", paths });

    return { count: found.length, run: runChecks(found) } satisfies DueChecks;
  });

  return CommitChecks.of({ due });
});
