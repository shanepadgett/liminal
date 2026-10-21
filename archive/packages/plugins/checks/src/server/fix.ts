/**
 * The fix wrapper: around each call that can write, it finds the files the call changed, runs the
 * fixers on them silently, and saves what changed for the checks to read later.
 */

import { Effect, Option } from "effect";

import { draft, type EntryDraft, type Pipeline, type SessionId } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import type { AllowedCall, ToolOutcome } from "@liminal/tools/contract";

import { type Changes, ChangesEntry, FixedEntry } from "../contract.ts";
import { makeChecksFile, type ProjectChecks } from "./file.ts";
import { makeRunner } from "./run.ts";
import { save } from "./save.ts";
import { changedPaths, makeSnapshots, type Snapshot } from "./snapshot.ts";

const unknown: Changes = { type: "unknown" };

const changesDraft = (changes: Changes) =>
  draft(ChangesEntry, {
    data: changes,
    text: changes.type === "unknown" ? "Changed: unknown" : `Changed: ${changes.paths.join(", ")}`,
  });

const hasChanges = (changes: Changes) => changes.type === "unknown" || changes.paths.length > 0;

export const makeFixWrapper = Effect.gen(function* () {
  const log = yield* SessionLog;
  const { load } = yield* makeChecksFile;
  const snapshots = yield* makeSnapshots;
  const { dueChecks, runChecks } = yield* makeRunner;

  /** Runs the fixers due on `paths` and returns the debug line saying so, if any ran. */
  const fix = Effect.fn("Checks.fix")(function* (
    checks: ProjectChecks,
    paths: ReadonlyArray<string>,
  ) {
    const due = yield* dueChecks(checks.fix, checks.root, { type: "files", paths });
    if (due.length === 0) return Option.none<EntryDraft>();

    const report = yield* runChecks(due);
    const names = due.map(({ check }) => check.name).join(", ");
    const failed = report.failed.map(({ name }) => name).join(", ");
    const text = `Fixed with ${names}${failed === "" ? "" : `; ${failed} failed`}`;

    return Option.some<EntryDraft>(draft(FixedEntry, { data: report, text }));
  });

  /** What changed since `before`, after the fixers ran, with the entries to save. */
  const changesSince = Effect.fn("Checks.changesSince")(function* (
    checks: ProjectChecks,
    before: Option.Option<Snapshot>,
  ) {
    const after = yield* snapshots.take();
    if (Option.isNone(before) || Option.isNone(after)) return [changesDraft(unknown)];

    const paths = changedPaths(before.value, after.value);
    if (paths.length === 0) return [];

    const fixed = yield* fix(checks, paths);
    const settled = Option.isSome(fixed) ? yield* snapshots.take() : after;

    const changes: Changes = Option.match(settled, {
      onNone: () => unknown,
      onSome: (taken) => ({ type: "files", paths: changedPaths(before.value, taken) }),
    });

    return [...Option.toArray(fixed), ...(hasChanges(changes) ? [changesDraft(changes)] : [])];
  });

  const tracked = Effect.fn("Checks.tracked")(function* (
    session: SessionId,
    checks: ProjectChecks,
    next: Effect.Effect<ToolOutcome>,
  ) {
    const before = yield* snapshots.take();
    const outcome = yield* next;

    yield* save(log, session, yield* changesSince(checks, before));

    return outcome;
  });

  const loaded = load().pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning(error.message), Option.none<ProjectChecks>()),
    ),
  );

  const wrapper: Pipeline.Middleware<AllowedCall, ToolOutcome, never> = ({ call, tool }, next) =>
    // An inner call's changes are found once, around its outer call.
    tool.hints.readOnlyHint || call.outer !== undefined
      ? next
      : Effect.flatMap(loaded, (checks) =>
          Option.match(checks, {
            onNone: () => next,
            onSome: (found) => tracked(call.sessionId, found, next),
          }),
        );

  return wrapper;
});
