/** The facts section: workspace, git, platform, shell and date, read on every request. */

import { Clock, Config, Effect, Option } from "effect";

import type { Lines } from "@liminal/context/contract";

import { isRepository, type Workspace } from "./workspace.ts";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "full" });

/** The user's login shell, when `SHELL` names one. */
const loginShell = Config.option(Config.String("SHELL")).pipe(
  Effect.orElseSucceed(() => Option.none<string>()),
);

/** One `Name: value` line per fact. */
export const factLines = Effect.fn("factLines")(function* (workspace: Workspace) {
  const repository = yield* isRepository(workspace);
  const shell = yield* loginShell;
  const now = yield* Clock.currentTimeMillis;

  const lines: Lines = [
    `Workspace: ${workspace.folder}`,
    `Git repository: ${repository ? "yes" : "no"}`,
    `Platform: ${process.platform} ${process.arch}`,
    ...Option.match(shell, { onNone: () => [], onSome: (name) => [`Shell: ${name}`] }),
    `Date: ${dateFormat.format(now)}`,
  ];

  return lines;
});
