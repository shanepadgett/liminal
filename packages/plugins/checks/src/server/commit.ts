/**
 * The checks `/commit` runs: the `check` and `commit` lists, due on the files it will commit and
 * not already passed on them.
 */

import { Effect, Option } from "effect";

import type { SessionId } from "@liminal/sdk";

import { CommitChecks, type DueChecks } from "../contract.ts";
import { makeChecksFile } from "./file.ts";
import { makePassed } from "./passed.ts";
import { makeRunner } from "./run.ts";

export const makeCommitChecks = Effect.gen(function* () {
  const { load } = yield* makeChecksFile;
  const { dueChecks } = yield* makeRunner;
  const { plan } = yield* makePassed;

  const due = Effect.fn("Checks.commitDue")(function* (
    session: SessionId,
    paths: ReadonlyArray<string>,
  ) {
    const checks = yield* load();

    if (Option.isNone(checks)) {
      return { count: 0, run: Effect.succeed({ passed: [], failed: [] }) } satisfies DueChecks;
    }

    const { check, commit, root } = checks.value;
    const found = yield* dueChecks([...check, ...commit], root, { type: "files", paths });

    return yield* plan(session, found, root);
  });

  return CommitChecks.of({ due });
});
