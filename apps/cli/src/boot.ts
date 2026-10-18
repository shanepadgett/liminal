/** Where the app finds its plugins and code, and the packages its plugins share with it. */

import type { Path } from "effect";

import type { SharedModules } from "@liminal/kernel";

/** The repository root, when run from source. */
export const repoRoot = (path: Path.Path) => path.resolve(import.meta.dir, "../../..");

/** The built-in plugins' folder. */
export const pluginsFolder = (path: Path.Path) => path.join(repoRoot(path), "packages/plugins");

/** The code the app loads at start; a change there needs a new process. */
export const restartRoots = (path: Path.Path) =>
  ["apps/cli/src", "packages/kernel/src", "packages/sdk/src", "packages/frontend/src"].map(
    (folder) => path.join(repoRoot(path), folder),
  );

/** One copy of the runtime, the SDK and the TUI's libraries, shared by the app and every plugin. */
export const sharedModules: SharedModules = {
  from: import.meta.dir,
  packages: [
    "effect",
    "@liminal/sdk",
    "@opentui/core",
    "@opentui/keymap",
    "@opentui/solid",
    "solid-js",
  ],
};
