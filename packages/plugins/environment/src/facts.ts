/** One `Name: value` line per fact about where Liminal runs. */
import { Clock, Effect, Option } from "effect";

import type { Directories } from "@shanepadgett/liminal-directories/contract";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "full" });

export const factLines = Effect.fn("factLines")(function* (directories: Directories["Service"]) {
  const branch = yield* directories.branch;
  const now = yield* Clock.currentTimeMillis;

  const git = Option.match(directories.repository, {
    onNone: () => ["Git repository: none"],
    onSome: (root) => [
      `Git repository: ${root}`,
      ...Option.match(branch, { onNone: () => [], onSome: (name) => [`Git branch: ${name}`] }),
    ],
  });

  return [
    `Workspace: ${directories.workspace}`,
    ...git,
    `Platform: ${process.platform} ${process.arch}`,
    `Date: ${dateFormat.format(now)}`,
  ];
});
