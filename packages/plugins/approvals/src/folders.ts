/**
 * The folders a session's calls may reach: the `AllowedFolders` entries, then the session's grants.
 * Paths are compared after `realpath`, so a symlink cannot lead outside.
 */
import { homedir } from "node:os";

import { Effect, FileSystem, Option, Path, Ref } from "effect";

import { type SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";

import { type AllowedFolder, AllowedFolders, Granted } from "./contract.ts";

export type Reach = AllowedFolder["access"];

/** `target` with a leading `~` replaced by the home folder. */
const expandHome = (target: string) =>
  target === "~" || target.startsWith("~/") ? `${homedir()}${target.slice(1)}` : target;

export const makeFolders = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const log = yield* SessionLog;
  const registry = yield* AllowedFolders;
  const grants = yield* Ref.make<ReadonlyMap<SessionId, ReadonlyArray<AllowedFolder>>>(new Map());

  /** The real path of `target`'s nearest existing ancestor, with the rest joined on. */
  const realOf = (target: string): Effect.Effect<string> =>
    fs.realPath(target).pipe(
      Effect.catch(() => {
        const parent = path.dirname(target);
        if (parent === target) return Effect.succeed(target);

        return Effect.map(realOf(parent), (real) => path.join(real, path.basename(target)));
      }),
    );

  /** `target` as an absolute real path: `~` expanded, relative to `from`. */
  const resolve = (from: string, target: string) => realOf(path.resolve(from, expandHome(target)));

  const isInside = (folder: string, target: string) => {
    const relative = path.relative(folder, target);
    const isAbove = relative === ".." || relative.startsWith(`..${path.sep}`);

    return relative === "" || (!isAbove && !path.isAbsolute(relative));
  };

  /** The session's grants, read from its log the first time. */
  const grantsOf = Effect.fn("Folders.grantsOf")(function* (session: SessionId) {
    const known = (yield* Ref.get(grants)).get(session);
    if (known !== undefined) return known;

    const events = yield* log.read(session);
    const decoded = yield* Effect.forEach(events, Granted.decode);
    const loaded = decoded.flatMap(Option.toArray);
    yield* Ref.update(grants, (all) => new Map(all).set(session, loaded));

    return loaded;
  });

  /** Every allowed folder in the session, each path real. */
  const list = Effect.fn("Folders.list")(function* (session: SessionId) {
    const entries = yield* registry.list;

    const real = yield* Effect.forEach(entries, (entry) =>
      Effect.map(realOf(entry.path), (resolved) => ({ ...entry, path: resolved })),
    );

    return [...real, ...(yield* grantsOf(session))];
  });

  /** The paths, as given, that `reach` may not touch; relative ones resolve against `from`. */
  const outside = Effect.fn("Folders.outside")(function* (
    session: SessionId,
    from: string,
    reach: Reach,
    paths: ReadonlyArray<string>,
  ) {
    const folders = (yield* list(session)).filter(
      (folder) => reach === "read" || folder.access === "write",
    );

    const resolved = yield* Effect.forEach(paths, (each) => resolve(from, each));

    return paths.filter(
      (_, index) => !folders.some((folder) => isInside(folder.path, resolved[index] ?? "")),
    );
  });

  /** Logs the grant and allows it for the rest of the session. */
  const grant = Effect.fn("Folders.grant")(function* (session: SessionId, folder: AllowedFolder) {
    const current = yield* grantsOf(session);
    yield* log.append(session, [yield* Granted.make(folder)]);
    yield* Ref.update(grants, (all) => new Map(all).set(session, [...current, folder]));
  });

  return { resolve, list, outside, grant };
});

export type Folders = Effect.Success<typeof makeFolders>;
