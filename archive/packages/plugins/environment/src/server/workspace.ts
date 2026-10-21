/** The workspace the environment sections describe, and whether git tracks it. */

import { Duration, Effect, type FileSystem, type Path } from "effect";

import type { CommandRunner } from "@liminal/command-runner/contract";

/** The services the sections read the workspace through. */
export interface Workspace {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly runner: CommandRunner["Service"];
  /** The folder Liminal runs in. */
  readonly folder: string;
}

/** How long a git command may run. */
export const gitTimeout = Duration.seconds(10);

/** Whether the workspace is inside a git work tree; false when git is missing. */
export const isRepository = ({ runner, folder }: Workspace) =>
  Effect.map(
    runner.run({
      command: "git rev-parse --is-inside-work-tree",
      cwd: folder,
      timeout: gitTimeout,
    }),
    (result) =>
      result.end.type === "exited" && result.end.code === 0 && result.stdout.trim() === "true",
  );
