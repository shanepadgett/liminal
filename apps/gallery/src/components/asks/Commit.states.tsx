import type { State } from "../../entries.ts";
import { atBottom } from "../chat/Composer.states.tsx";
import { Commit, commitHintsOf, type CommitStep, type PlannedCommit } from "./Commit.tsx";

const ONE_COMMIT: readonly PlannedCommit[] = [
  {
    subject: "fix(chat): keep the sticky prompt in view after a resize",
    files: [{ status: "M", path: "packages/plugins/chat/src/tui/sticky.tsx" }],
  },
];

const PLAN: readonly PlannedCommit[] = [
  {
    subject: "feat(usage): price long requests at tier rates",
    files: [
      { status: "M", path: "packages/plugins/usage/src/count.ts" },
      { status: "A", path: "packages/plugins/usage/src/tiers.ts" },
      { status: "M", path: "packages/plugins/model/src/contract.ts" },
      { status: "M", path: "packages/plugins/model/src/listing.ts" },
      { status: "M", path: "packages/plugins/model-catalog/src/models-dev.ts" },
    ],
  },
  {
    subject: "refactor(session): read the name from the latest event",
    files: [
      { status: "M", path: "packages/plugins/session/src/store.ts" },
      { status: "R", path: "packages/plugins/session/src/name.ts" },
    ],
  },
  {
    subject: "docs(usage): describe the Usage section",
    files: [
      { status: "M", path: "docs/usage/cli.md" },
      { status: "D", path: "docs/plugins/providers.md" },
    ],
  },
];

const LONG_PLAN: readonly PlannedCommit[] = [
  ...PLAN,
  {
    subject: "chore: bump effect to 4.0.5",
    files: [
      { status: "M", path: "package.json" },
      { status: "M", path: "bun.lock" },
    ],
  },
  {
    subject: "style(tui): fade the gutter one step darker",
    files: [{ status: "M", path: "packages/tui/src/kit/Gutter.tsx" }],
  },
  {
    subject: "test(tools): cover the plugin anatomy check",
    files: [{ status: "A", path: "tools/checks/plugin-anatomy.test.ts" }],
  },
];

const commit = (step: CommitStep) =>
  atBottom({ ask: () => <Commit step={step} />, hints: commitHintsOf(step) });

export const commitStates: readonly [State, ...State[]] = [
  {
    name: "Planning",
    fill: "screen",
    view: commit({ kind: "planning", files: 9, model: "claude-haiku-4.5" }),
  },
  {
    name: "One commit",
    fill: "screen",
    view: commit({ kind: "review", commits: ONE_COMMIT, top: 0 }),
  },
  {
    name: "Several commits",
    fill: "screen",
    view: commit({ kind: "review", commits: PLAN, top: 0 }),
  },
  {
    name: "Scrolled plan",
    fill: "screen",
    view: commit({ kind: "review", commits: LONG_PLAN, top: 1 }),
  },
  {
    name: "Committing",
    fill: "screen",
    view: commit({ kind: "committing", commits: PLAN, hashes: ["a41c9e2"] }),
  },
  {
    name: "Push?",
    fill: "screen",
    view: commit({ kind: "push", count: 3, target: "origin/main", choice: 0 }),
  },
  {
    name: "Pushing",
    fill: "screen",
    view: commit({ kind: "pushing", count: 3, target: "origin/main" }),
  },
];
