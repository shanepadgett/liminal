/** Physical skill entries, including overridden copies and dangling symlinks. */

import { Effect, type FileSystem, Option, Predicate, Result, Schema } from "effect";

import {
  FolderLocation,
  SymlinkLocation,
  MissingTargetLocation,
  type ManagedSkill,
  type SkillFolder,
} from "../contract.ts";
import { parseSkill } from "./find.ts";
import { type Finder, foldersOf } from "./folders.ts";

const Errno = Schema.Struct({ code: Schema.String });

/** Stat follows links; readLink must identify links before any target lookup. */
const linkAt = Effect.fn("skills.linkAt")(function* (finder: Finder, entry: string) {
  return yield* finder.fs.readLink(entry).pipe(
    Effect.asSome,
    Effect.catch((error) => {
      const errno = Schema.decodeUnknownOption(Errno)(error.cause);

      if (Option.isSome(errno) && errno.value.code === "EINVAL")
        return Effect.succeed(Option.none<string>());

      return Effect.fail(error);
    }),
  );
});

const identity = (info: FileSystem.File.Info) =>
  [
    info.type,
    String(info.dev),
    Option.match(info.ino, { onNone: () => "", onSome: String }),
    Option.match(info.birthtime, { onNone: () => "", onSome: (date) => date.toISOString() }),
  ].join(":");

export interface SkillSnapshot {
  readonly skill: ManagedSkill;
  readonly root: string;
  readonly rootIdentity: string;
  readonly entryIdentity: string;
  readonly target: string | null;
  readonly hasSkillFile: boolean;
}

export const rootIdentity = Effect.fn("skills.rootIdentity")(function* (
  finder: Finder,
  root: string,
) {
  const real = yield* finder.fs.realPath(root);

  const info = yield* finder.fs.stat(root);

  return `${real}:${identity(info)}`;
});

const describe = Effect.fn("skills.describe")(function* (finder: Finder, entry: string) {
  const file = finder.path.join(entry, "SKILL.md");

  const text = yield* finder.fs.readFileString(file).pipe(Effect.result);

  if (Result.isFailure(text))
    return { description: `Could not read ${file}: ${text.failure.message}`, hasSkillFile: false };

  const parsed = parseSkill(finder.path, { path: file, text: text.success });

  return {
    description: Result.isSuccess(parsed)
      ? parsed.success.description
      : `Unavailable: ${parsed.failure}`,
    hasSkillFile: true,
  };
});

/** Missing targets are distinct from unreadable targets and symlink loops. */
export const inspectSkill = Effect.fn("skills.inspect")(function* (
  finder: Finder,
  root: string,
  name: string,
  revision: string,
) {
  const entry = finder.path.join(root, name);

  const link = yield* linkAt(finder, entry);

  const info = yield* finder.fs.stat(entry).pipe(
    Effect.asSome,
    Effect.catchIf(
      (error) => Option.isSome(link) && Predicate.isTagged(error.reason, "NotFound"),
      () => Effect.succeed(Option.none<FileSystem.File.Info>()),
    ),
  );

  if (Option.isNone(link) && Option.isSome(info) && info.value.type !== "Directory")
    return Option.none<SkillSnapshot>();

  const target = Option.isSome(info) ? yield* finder.fs.realPath(entry) : null;

  const location: ManagedSkill["location"] = Option.match(link, {
    onNone: () => FolderLocation.make({}),
    onSome: (text) =>
      (target === null ? MissingTargetLocation : SymlinkLocation).make({
        target: target ?? finder.path.resolve(root, text),
      }),
  });

  const details =
    Option.isSome(info) && info.value.type === "Directory"
      ? yield* describe(finder, entry)
      : {
          description:
            target === null
              ? "Unavailable: the symlink target is missing."
              : "Unavailable: the target is not a folder.",
          hasSkillFile: false,
        };

  return Option.some<SkillSnapshot>({
    skill: { id: entry, revision, name, path: entry, description: details.description, location },
    root,
    rootIdentity: yield* rootIdentity(finder, root),
    entryIdentity: `${Option.getOrElse(link, () => "")}:${target}:${Option.match(info, { onNone: () => "missing", onSome: identity })}`,
    target,
    hasSkillFile: details.hasSkillFile,
  });
});

const inventoryFolder = Effect.fn("skills.inventoryFolder")(function* (
  finder: Finder,
  root: string,
  revision: string,
) {
  const names = yield* finder.fs.readDirectory(root).pipe(
    Effect.catchIf(
      (error) => Predicate.isTagged(error.reason, "NotFound"),
      () => Effect.succeed([]),
    ),
  );

  const scanned = yield* Effect.forEach(
    names.toSorted((left, right) => left.localeCompare(right)),
    (name) => inspectSkill(finder, root, name, revision).pipe(Effect.result),
  );

  const snapshots = scanned.flatMap((entry) =>
    Result.isSuccess(entry) ? Option.toArray(entry.success) : [],
  );

  const failures = scanned.flatMap((entry) =>
    Result.isFailure(entry) ? [entry.failure.message] : [],
  );

  return { snapshots, problem: failures.length === 0 ? null : failures.join("\n") };
});

export const inventorySkills = Effect.fn("skills.inventory")(function* (
  finder: Finder,
  revision: string,
) {
  const roots = [...new Set(yield* foldersOf(finder))];

  const globals = new Set([
    finder.path.join(finder.directories.home, ".agents", "skills"),
    finder.path.join(finder.directories.global, "skills"),
  ]);

  const scanned = yield* Effect.forEach(roots, (root) =>
    inventoryFolder(finder, root, revision).pipe(Effect.result),
  );

  const folders: ReadonlyArray<SkillFolder> = roots.map((root, index) => {
    const result = scanned[index];

    const found = result && Result.isSuccess(result) ? result.success : null;

    return {
      path: root,
      isGlobal: globals.has(root),
      entries: found?.snapshots.map(({ skill }) => skill) ?? [],
      problem:
        result && Result.isFailure(result) ? result.failure.message : (found?.problem ?? null),
    };
  });

  const snapshots = scanned.flatMap((result) =>
    Result.isSuccess(result) ? result.success.snapshots : [],
  );

  return { folders, snapshots };
});
