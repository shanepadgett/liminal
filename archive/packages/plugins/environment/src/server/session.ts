/** The Session section's facts: the folder Liminal runs in and the git branch, read on a timer. */

import { Duration, Effect, Schedule, Stream } from "effect";

import type { SessionInfo } from "../contract.ts";
import { gitTimeout, type Workspace } from "./workspace.ts";

/** How often the branch is read again. */
const READ_EVERY = Duration.seconds(5);

/** `path` with the home folder written as `~`. */
export const homeRelative = (path: string, home: string) => {
  if (path === home) return "~";

  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
};

/** The first line `command` prints in the workspace; none when it fails or prints nothing. */
const printed = ({ runner, folder }: Workspace, command: string) =>
  runner.run({ command, cwd: folder, timeout: gitTimeout }).pipe(
    Effect.map((result) => {
      const line = result.stdout.trim();

      return result.end.type === "exited" && result.end.code === 0 && line !== ""
        ? line
        : undefined;
    }),
    Effect.orElseSucceed(() => {}),
  );

/** The branch, else the short hash of a detached HEAD; none outside a repository. */
const branchOf = Effect.fn("branchOf")(function* (workspace: Workspace) {
  return (
    (yield* printed(workspace, "git branch --show-current"))
    ?? (yield* printed(workspace, "git rev-parse --short HEAD"))
  );
});

/** The Session section's facts now. */
export const readSession = Effect.fn("readSession")(function* (workspace: Workspace, home: string) {
  const folder = homeRelative(workspace.folder, home);
  const branch = yield* branchOf(workspace);

  return branch === undefined ? { folder } : { folder, branch };
});

const isSame = (left: SessionInfo, right: SessionInfo) =>
  left.folder === right.folder && left.branch === right.branch;

/** The facts on subscribe, then again after each change found by reading every few seconds. */
export const watchSession = (workspace: Workspace, home: string) =>
  Stream.fromEffect(readSession(workspace, home)).pipe(
    Stream.repeat(Schedule.spaced(READ_EVERY)),
    Stream.changesWith(isSame),
  );
