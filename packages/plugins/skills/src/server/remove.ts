/** Deletion uses server snapshots and rechecks paths immediately before filesystem changes. */

import { Effect, Option, Predicate, Ref, Semaphore, type PlatformError } from "effect";

import { type DeleteSkillRequest, SkillManagementFailed } from "../contract.ts";
import { type Finder, foldersOf } from "./folders.ts";
import { inspectSkill, inventorySkills, type SkillSnapshot } from "./inventory.ts";

const failed = (path: string, reason: SkillManagementFailed["reason"], message: string) =>
  new SkillManagementFailed({ path, reason, message });

const changed = (path: string) =>
  failed(
    path,
    "changed",
    `${path} changed or is no longer available. Refresh the skill list and confirm again.`,
  );

const contains = (finder: Finder, parent: string, child: string) => {
  const relative = finder.path.relative(parent, child);

  return (
    relative === ""
    || (!finder.path.isAbsolute(relative)
      && relative !== ".."
      && !relative.startsWith(`..${finder.path.sep}`))
  );
};

const validateTarget = Effect.fn("skills.validateTarget")(function* (
  finder: Finder,
  snapshot: SkillSnapshot,
) {
  const target = snapshot.target;

  if (target === null) return yield* changed(snapshot.skill.path);

  const roots = yield* foldersOf(finder);

  const protectedPaths = [...roots, ...Object.values(finder.directories)];

  const protectedReal = yield* Effect.forEach(protectedPaths, (path) =>
    finder.fs.realPath(path).pipe(
      Effect.catchIf(
        (error) => Predicate.isTagged(error.reason, "NotFound"),
        () => Effect.succeed(finder.path.resolve(path)),
      ),
    ),
  );

  const linkPath = finder.path.join(
    yield* finder.fs.realPath(snapshot.root),
    finder.path.basename(snapshot.skill.path),
  );

  const isUnsafe =
    finder.path.dirname(target) === target
    || protectedReal.some((path) => contains(finder, target, path))
    || (!Predicate.isTagged(snapshot.skill.location, "Folder")
      && contains(finder, target, linkPath));

  if (isUnsafe)
    return yield* failed(
      target,
      "forbidden",
      `Refusing to delete protected folder ${target}. Delete only the symlink instead.`,
    );

  return yield* Effect.void;
});

const validateSelection = Effect.fn("skills.validateSelection")(function* (
  finder: Finder,
  snapshot: SkillSnapshot,
  mode: DeleteSkillRequest["mode"],
) {
  const { skill, root } = snapshot;

  const roots = yield* foldersOf(finder);

  if (!roots.includes(root)) return yield* changed(skill.path);

  const fresh = yield* inspectSkill(finder, root, finder.path.basename(skill.path), skill.revision);

  if (Option.isNone(fresh)) return yield* changed(skill.path);

  const current = fresh.value;

  const isChanged =
    current.rootIdentity !== snapshot.rootIdentity
    || current.entryIdentity !== snapshot.entryIdentity
    || JSON.stringify(current.skill) !== JSON.stringify(skill);

  if (isChanged) return yield* changed(skill.path);

  const isFolder = Predicate.isTagged(skill.location, "Folder");

  if ((mode === "folder") !== isFolder)
    return yield* failed(
      skill.path,
      "forbidden",
      `Invalid deletion choice for ${skill.path}. Refresh and choose again.`,
    );

  if (mode !== "symlink-only") yield* validateTarget(finder, current);

  if (mode === "symlink-and-target" && !current.hasSkillFile) {
    return yield* failed(
      skill.path,
      "forbidden",
      `The target of ${skill.path} is not a readable skill directory. Delete only the symlink instead.`,
    );
  }

  return current;
});

const deleteSelection = Effect.fn("skills.deleteSelection")(function* (
  finder: Finder,
  snapshot: SkillSnapshot,
  mode: DeleteSkillRequest["mode"],
) {
  const current = yield* validateSelection(finder, snapshot, mode);

  if (mode === "symlink-and-target" && current.target !== null) {
    yield* finder.fs.remove(current.target, { recursive: true });

    // The target is already gone; cancellation must not skip link cleanup or its partial error.
    yield* finder.fs
      .remove(current.skill.path)
      .pipe(
        Effect.mapError((error) =>
          failed(
            current.skill.path,
            "partial",
            `Deleted target ${current.target}, but could not delete symlink ${current.skill.path}: ${error.message}. Refresh and remove the broken symlink.`,
          ),
        ),
      );

    return;
  }

  yield* finder.fs.remove(current.skill.path, { recursive: mode === "folder" });
});

const mapError = (path: string) => (error: PlatformError.PlatformError | SkillManagementFailed) =>
  Predicate.isTagged(error, "SkillManagementFailed")
    ? error
    : failed(
        path,
        "io",
        `Could not manage ${path}: ${error.message}. Refresh and check folder permissions before trying again.`,
      );

export const makeSkillManagement = Effect.fn("skills.makeManagement")(function* (finder: Finder) {
  const state = yield* Ref.make({ revision: 0, snapshots: new Map<string, SkillSnapshot>() });

  const lock = yield* Semaphore.make(1);

  const inventory = Effect.fn("skills.listInventory")(function* () {
    const revision = (yield* Ref.get(state)).revision + 1;

    // Invalidate before scanning, including scans interrupted or failed partway through.
    yield* Ref.set(state, { revision, snapshots: new Map() });

    const result = yield* inventorySkills(finder, String(revision));

    yield* Ref.set(state, {
      revision,
      snapshots: new Map(result.snapshots.map((snapshot) => [snapshot.skill.id, snapshot])),
    });

    return result.folders;
  });

  const remove = Effect.fn("skills.remove")(function* (request: DeleteSkillRequest) {
    const previous = yield* Ref.get(state);

    const snapshot = previous.snapshots.get(request.id);

    if (!snapshot || snapshot.skill.revision !== request.revision)
      return yield* changed(request.id);

    // Consume once before any I/O. Retrying always requires a fresh inventory and confirmation.
    yield* Ref.set(state, { ...previous, snapshots: new Map() });

    return yield* deleteSelection(finder, snapshot, request.mode);
  });

  return {
    inventory: () => lock.withPermit(inventory()).pipe(Effect.mapError(mapError("skill folders"))),
    remove: (request: DeleteSkillRequest) =>
      lock
        .withPermit(Effect.uninterruptible(remove(request)))
        .pipe(Effect.mapError(mapError(request.id))),
  };
});
