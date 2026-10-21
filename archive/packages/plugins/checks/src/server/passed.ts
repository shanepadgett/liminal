/**
 * Passes: a check that passed is saved with a key for the files it covered, and is left out of a
 * later run that would cover the same files. A whole-project check covers every changed file its
 * globs match; a check that takes `{files}` covers the files it was given.
 */

import { Effect, Option, Path, Schema } from "effect";

import { draft, type Entry, type EntryDraft, type SessionId } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

import { type CheckReport, type DueChecks, PassedEntry } from "../contract.ts";
import { type DueCheck, makeRunner, matches } from "./run.ts";
import { save } from "./save.ts";
import { makeSnapshots, type Snapshot } from "./snapshot.ts";

const decodePassed = Schema.decodeUnknownOption(PassedEntry.data);

/** A due check with its key, or none when what it covers is unknown. */
interface Keyed {
  readonly due: DueCheck;
  readonly key: Option.Option<string>;
}

/** The key of `one` on `snapshot` at `head`: its definition and the version of each file it covers. */
const keyOf = (
  path: Path.Path,
  root: string,
  one: DueCheck,
  at: { readonly snapshot: Snapshot; readonly head: string },
): Option.Option<string> => {
  // Unknown changes leave a `{files}` check with no files; there is nothing to key it by.
  if (one.check.takesFiles && one.files.length === 0) return Option.none();

  const covered = one.check.takesFiles
    ? one.files.map((file) => path.relative(root, file))
    : [...at.snapshot.keys()].filter((file) => matches(one.check, file));

  const versions = covered
    .toSorted()
    .map((file) => [file, at.snapshot.get(file) ?? "clean"] as const);

  return Option.some(
    Bun.hash(JSON.stringify([one.check.definition, at.head, versions])).toString(),
  );
};

/** The key each check last passed with, from the session's entries. */
const latestKeys = (entries: ReadonlyArray<Entry>) => {
  const keys = new Map<string, string>();

  for (const entry of entries) {
    if (entry.kind !== PassedEntry.kind) continue;

    const passed = decodePassed(entry.data);
    if (Option.isSome(passed)) keys.set(passed.value.name, passed.value.key);
  }

  return keys;
};

/** A pass entry for each keyed check of `run` that passed. */
const passesOf = (run: ReadonlyArray<Keyed>, report: CheckReport) =>
  run.flatMap(({ due, key }): ReadonlyArray<EntryDraft> =>
    Option.isSome(key) && report.passed.includes(due.check.name)
      ? [
          draft(PassedEntry, {
            data: { name: due.check.name, key: key.value },
            text: `Passed: ${due.check.name}`,
          }),
        ]
      : [],
  );

export const makePassed = Effect.gen(function* () {
  const log = yield* SessionLog;
  const path = yield* Path.Path;
  const snapshots = yield* makeSnapshots;
  const { runChecks } = yield* makeRunner;

  /** Each due check with its key. Without git nothing is keyed, so every check runs. */
  const keyed = Effect.fn("Checks.key")(function* (due: ReadonlyArray<DueCheck>, root: string) {
    const [snapshot, head] = yield* Effect.all([snapshots.take(), snapshots.headOf()]);

    return due.map((one): Keyed => {
      if (Option.isNone(snapshot) || Option.isNone(head)) return { due: one, key: Option.none() };

      return {
        due: one,
        key: keyOf(path, root, one, { snapshot: snapshot.value, head: head.value }),
      };
    });
  });

  const record = (session: SessionId, run: ReadonlyArray<Keyed>, report: CheckReport) =>
    save(log, session, passesOf(run, report));

  /**
   * The checks of `due` that have not passed on the same files in the session, run together; the
   * report names the others as skipped and the passes are saved. Keys are taken before the run, so
   * a file edited while the checks run changes the key and the check runs again next time.
   */
  const plan = Effect.fn("Checks.plan")(function* (
    session: SessionId,
    due: ReadonlyArray<DueCheck>,
    root: string,
  ) {
    const all = yield* keyed(due, root);

    const past = yield* log.read(session, {}).pipe(
      Effect.map(latestKeys),
      Effect.orElseSucceed(() => new Map<string, string>()),
    );

    const isPassed = ({ due: one, key }: Keyed) =>
      Option.isSome(key) && past.get(one.check.name) === key.value;

    const open = all.filter((one) => !isPassed(one));
    const skipped = all.flatMap((one) => (isPassed(one) ? [one.due.check.name] : []));

    const run = Effect.gen(function* () {
      const report = yield* runChecks(
        open.map((one) => one.due),
        "unbounded",
      );

      yield* record(session, open, report);

      return { ...report, skipped } satisfies CheckReport;
    });

    return { count: open.length, run } satisfies DueChecks;
  });

  return { plan };
});
