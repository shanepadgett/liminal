/** The clones in `<data>/references` and the git commands that change them. */

import { Config, Effect, FileSystem, Option, Path, Queue, Stream } from "effect";
import type { HttpClient } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  type CloneEvent,
  Cloned,
  type Reference,
  ReferenceFailed,
  referenceNameOf,
} from "../contract.ts";
import { cloneInto } from "./clone.ts";
import {
  fillDescription,
  githubDescription,
  readDescription,
  saveDescription,
} from "./description.ts";
import { LOOKUP_TIMEOUT, NETWORK_TIMEOUT, runGit } from "./git.ts";

/** A clone not finished yet starts with this; listing skips it, as it skips every dot name. */
const UNFINISHED = ".clone-";

const SHORT_HASH = 7;
const HEAD_BRANCH = /^ref: refs\/heads\/(.+)$/m;
const DESCRIPTION_CONCURRENCY = 4;

/** What the library works with. */
export interface LibraryTools {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly http: HttpClient.HttpClient;
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  /** The folder of the clones. */
  readonly folder: string;
}

const failed = (reference: string, message: string) => new ReferenceFailed({ reference, message });

/** The clone's branch from `.git/HEAD`, with no git process, so listing many stays fast. */
const describe = (tools: LibraryTools, name: string) =>
  Effect.gen(function* () {
    const clone = tools.path.join(tools.folder, name);

    const head = yield* Effect.option(
      tools.fs.readFileString(tools.path.join(clone, ".git", "HEAD")),
    );

    const branch = Option.map(
      head,
      (text) => HEAD_BRANCH.exec(text)?.[1] ?? text.trim().slice(0, SHORT_HASH),
    );

    const description = yield* readDescription(tools, clone);

    return {
      name,
      ...Option.match(branch, { onNone: () => ({}), onSome: (each) => ({ branch: each }) }),
      ...Option.match(description, {
        onNone: () => ({}),
        onSome: (each) => ({ description: each }),
      }),
    } satisfies Reference;
  });

/** The names of the finished clones. */
const namesIn = (tools: LibraryTools) =>
  tools.fs.readDirectory(tools.folder).pipe(
    Effect.map((names) => names.filter((name) => !name.startsWith(".")).toSorted()),
    Effect.orElseSucceed((): ReadonlyArray<string> => []),
  );

const git = (
  tools: LibraryTools,
  name: string,
  args: ReadonlyArray<string>,
  timeout = LOOKUP_TIMEOUT,
) =>
  runGit(name, tools.path.join(tools.folder, name), args, timeout).pipe(
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, tools.spawner),
  );

/**
 * Clones into an unfinished folder and renames it when git is done, so a failed clone leaves
 * nothing.
 */
const cloneFolder = (
  tools: LibraryTools,
  url: string,
  name: string,
  emit: (event: CloneEvent) => Effect.Effect<unknown>,
) =>
  Effect.gen(function* () {
    const target = tools.path.join(tools.folder, name);

    if (name === "")
      return yield* failed(
        url,
        "Could not find a name in the URL. Use a git URL such as https://github.com/owner/repo.",
      );

    if (yield* tools.fs.exists(target).pipe(Effect.orElseSucceed(() => false)))
      return yield* failed(name, `There is already a reference named ${name}. Delete it first.`);

    const unfinished = tools.path.join(tools.folder, `${UNFINISHED}${name}-${Date.now()}`);

    yield* tools.fs
      .makeDirectory(tools.folder, { recursive: true })
      .pipe(Effect.mapError((cause) => failed(name, cause.message)));

    yield* cloneInto(name, { folder: tools.folder, url, path: unfinished }, emit).pipe(
      Effect.andThen(
        tools.fs
          .rename(unfinished, target)
          .pipe(Effect.mapError((cause) => failed(name, cause.message))),
      ),
      Effect.onError(() =>
        tools.fs.remove(unfinished, { recursive: true, force: true }).pipe(Effect.ignore),
      ),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, tools.spawner),
    );

    yield* saveDescription(tools, target, yield* githubDescription(tools.http, url));

    return yield* Effect.asVoid(emit(Cloned.make({ reference: yield* describe(tools, name) })));
  });

/** Every branch of the clone and of its remote, sorted, each once. */
const branchesOf = (tools: LibraryTools, name: string) =>
  Effect.gen(function* () {
    const remote = yield* git(tools, name, ["ls-remote", "--heads", "origin"], NETWORK_TIMEOUT);
    const local = yield* git(tools, name, ["branch", "--format=%(refname:short)"]);

    const remoteNames = remote.split("\n").flatMap((line) => {
      const ref = line.split("\t")[1]?.replace(/^refs\/heads\//, "") ?? "";

      return ref === "" ? [] : [ref];
    });

    const localNames = local
      .split("\n")
      .flatMap((line) => (line.trim() === "" || line.startsWith("(") ? [] : [line.trim()]));

    return [...new Set([...localNames, ...remoteNames])].toSorted();
  });

/** Switches to `branch`, fetching it first when only the remote has it. */
const switchBranch = (tools: LibraryTools, name: string, branch: string) =>
  Effect.gen(function* () {
    const isLocal = (yield* git(tools, name, ["branch", "--list", branch])).trim() !== "";

    if (isLocal) yield* git(tools, name, ["switch", branch]);
    else {
      yield* git(tools, name, ["remote", "set-branches", "--add", "origin", branch]);
      yield* git(tools, name, ["fetch", "--quiet", "--depth=1", "origin", branch], NETWORK_TIMEOUT);
      yield* git(tools, name, ["switch", "--track", "-c", branch, `origin/${branch}`]);
    }

    return yield* describe(tools, name);
  });

/** The editor to open a clone in: `$VISUAL`, else `$EDITOR`, else `code`. */
const EDITOR = Config.String("VISUAL").pipe(
  Config.orElse(() => Config.String("EDITOR")),
  Config.withDefault("code"),
);

/** Opens the clone in the editor, and does not wait for it to close. */
const openClone = (tools: LibraryTools, name: string) =>
  Effect.gen(function* () {
    const editor = yield* EDITOR.pipe(Effect.orElseSucceed(() => "code"));

    const options = {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    } as const;

    const command = ChildProcess.make(editor, [tools.path.join(tools.folder, name)], options);

    yield* tools.spawner.spawn(command).pipe(
      Effect.flatMap((child) => child.exitCode),
      Effect.scoped,
      Effect.mapError((cause) => failed(name, `Could not start ${editor}: ${cause.message}`)),
      Effect.forkDetach,
    );
  });

export const makeLibrary = (tools: LibraryTools) => ({
  folder: tools.folder,
  names: namesIn(tools),
  list: Effect.flatMap(namesIn(tools), (names) =>
    Effect.forEach(names, (name) => describe(tools, name)),
  ),
  /** Fetches GitHub's description for each clone that has none saved; never fails. */
  fillDescriptions: Effect.flatMap(namesIn(tools), (names) =>
    Effect.forEach(names, (name) => fillDescription(tools, tools.path.join(tools.folder, name)), {
      concurrency: DESCRIPTION_CONCURRENCY,
      discard: true,
    }),
  ),
  clone: (url: string): Stream.Stream<CloneEvent, ReferenceFailed> =>
    Stream.callback<CloneEvent, ReferenceFailed>((queue) =>
      cloneFolder(tools, url, referenceNameOf(url), (event) => Queue.offer(queue, event)).pipe(
        Effect.andThen(Queue.end(queue)),
      ),
    ),
  pull: (name: string) =>
    Effect.asVoid(git(tools, name, ["pull", "--ff-only", "--quiet"], NETWORK_TIMEOUT)),
  branches: (name: string) => branchesOf(tools, name),
  switchBranch: (name: string, branch: string) => switchBranch(tools, name, branch),
  remove: (name: string) =>
    tools.fs
      .remove(tools.path.join(tools.folder, name), { recursive: true, force: true })
      .pipe(Effect.mapError((cause) => failed(name, cause.message))),
  open: (name: string) => openClone(tools, name),
});

export type Library = ReturnType<typeof makeLibrary>;
