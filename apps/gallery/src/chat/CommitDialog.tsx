/**
 * The `/commit` dialog: the title rule glides while checks run, the planner plans and git commits,
 * with one muted line saying which. The plan shows one line per commit, its subject then its file
 * count, for enter to commit. The push question offers No first.
 */

import { For } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { withRoles } from "../entryViews.ts";
import type { EntryState } from "../shell/entries.ts";
import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";

/** A planned commit as the dialog shows it. */
type Planned = { readonly subject: string; readonly files: number };

/** What the dialog shows: work in progress, the plan, or the push question. */
type CommitShown =
  | { readonly kind: "working"; readonly text: string }
  | { readonly kind: "plan"; readonly commits: readonly Planned[] }
  | { readonly kind: "push"; readonly title: string; readonly choice: number };

const PLAN: readonly Planned[] = [
  { subject: "feat: add commit plugin", files: 9 },
  { subject: "feat: run commit checks from the checks plugin", files: 4 },
  { subject: "docs: plan the commit step", files: 1 },
];

const PUSH_CHOICES = ["No, keep them local", "Yes, push"];

const PLAN_HINTS: readonly Hint[] = [["enter", "commit"]];

const PUSH_HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "answer"],
];

const filesText = (count: number) => (count === 1 ? "1 file" : `${count} files`);

function PlanLines(props: { readonly color: RoleColor; readonly commits: readonly Planned[] }) {
  return (
    <box flexDirection="column">
      <For each={props.commits}>
        {(commit) => (
          <box flexDirection="row" gap={2} height={1}>
            <text flexGrow={1} flexShrink={1} wrapMode="none" fg={props.color("text.base")}>
              {commit.subject}
            </text>
            <text flexShrink={0} wrapMode="none" fg={props.color("text.faint")}>
              {filesText(commit.files)}
            </text>
          </box>
        )}
      </For>
    </box>
  );
}

function PushChoices(props: { readonly color: RoleColor; readonly choice: number }) {
  return (
    <box flexDirection="column">
      <For each={PUSH_CHOICES}>
        {(label, index) => (
          <ListRow color={props.color} isSelected={index() === props.choice}>
            <text fg={props.color(index() === props.choice ? "text.base" : "text.muted")}>
              {label}
            </text>
          </ListRow>
        )}
      </For>
    </box>
  );
}

function ShownBody(props: { readonly color: RoleColor; readonly shown: CommitShown }) {
  const shown = props.shown;
  if (shown.kind === "working") return <text fg={props.color("text.muted")}>{shown.text}</text>;
  if (shown.kind === "plan") return <PlanLines color={props.color} commits={shown.commits} />;

  return <PushChoices color={props.color} choice={shown.choice} />;
}

const titleOf = (shown: CommitShown) => (shown.kind === "push" ? shown.title : "Commit");

const hintsOf = (shown: CommitShown): readonly Hint[] => {
  if (shown.kind === "plan") return PLAN_HINTS;

  return shown.kind === "push" ? PUSH_HINTS : [];
};

export function CommitDialog(props: { readonly color: RoleColor; readonly shown: CommitShown }) {
  return (
    <Dialog
      color={props.color}
      title={titleOf(props.shown)}
      isWorking={props.shown.kind === "working"}
      hints={hintsOf(props.shown)}
    >
      <ShownBody color={props.color} shown={props.shown} />
    </Dialog>
  );
}

const commitState = (name: string, shown: CommitShown): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => <CommitDialog color={color} shown={shown} />),
});

export const COMMIT_STATES: readonly [EntryState, ...EntryState[]] = [
  commitState("Running checks", { kind: "working", text: "Running 3 checks" }),
  commitState("Planning", { kind: "working", text: "Planning commits with openai/gpt-5.4-mini" }),
  commitState("Plan to approve", { kind: "plan", commits: PLAN }),
  commitState("Committing", { kind: "working", text: "Committing 2 of 3, hooks included" }),
  commitState("Push question", {
    kind: "push",
    title: "Push 3 commits to origin/main?",
    choice: 0,
  }),
];
