/**
 * The `/commit` prompt, a custom prompt in the composer's place. While checks run, the planner
 * plans and git commits, the top row glides and one muted line says which; esc stops the work. The
 * plan shows one line per commit, its subject then its file count, for enter to commit. The push
 * question offers No first. The approval mode stays in the model line.
 */

import { For, Show } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { withRoles } from "../entryViews.ts";
import type { EntryState } from "../shell/entries.ts";
import { ListRow } from "./ListRow.tsx";
import { PromptFrame } from "./PromptFrame.tsx";

/** A planned commit as the prompt shows it. */
type Planned = { readonly subject: string; readonly files: number };

/** What the prompt shows: work in progress, the plan, or the push question. */
export type CommitShown =
  | { readonly kind: "working"; readonly text: string }
  | { readonly kind: "plan"; readonly commits: readonly Planned[] }
  | { readonly kind: "push"; readonly title: string; readonly choice: number };

const PLAN: readonly Planned[] = [
  { subject: "feat: add commit plugin", files: 9 },
  { subject: "feat: run commit checks from the checks plugin", files: 4 },
  { subject: "docs: plan the commit step", files: 1 },
];

const PUSH_CHOICES = ["No, keep them local", "Yes, push"];

const WORKING_HINTS: readonly Hint[] = [["esc", "stop"]];

const PLAN_HINTS: readonly Hint[] = [
  ["enter", "commit"],
  ["esc", "cancel"],
];

const PUSH_HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "answer"],
  ["esc", "no"],
];

const filesText = (count: number) => (count === 1 ? "1 file" : `${count} files`);

const commitsText = (count: number) => (count === 1 ? "1 commit" : `${count} commits`);

const totalFiles = (commits: readonly Planned[]) =>
  commits.reduce((total, commit) => total + commit.files, 0);

function PlanLines(props: { readonly color: RoleColor; readonly commits: readonly Planned[] }) {
  return (
    <box flexDirection="column" marginTop={1}>
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
    <box flexDirection="column" marginTop={1}>
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

  if (shown.kind === "working") {
    return (
      <text marginTop={1} fg={props.color("text.muted")}>
        {shown.text}
      </text>
    );
  }

  if (shown.kind === "plan") return <PlanLines color={props.color} commits={shown.commits} />;

  return <PushChoices color={props.color} choice={shown.choice} />;
}

const titleOf = (shown: CommitShown) => (shown.kind === "push" ? shown.title : "Commit");

/** The plan's size, at the title's right end. */
const countOf = (shown: CommitShown) =>
  shown.kind === "plan"
    ? `${commitsText(shown.commits.length)}, ${filesText(totalFiles(shown.commits))}`
    : "";

const hintsOf = (shown: CommitShown): readonly Hint[] => {
  if (shown.kind === "working") return WORKING_HINTS;

  return shown.kind === "plan" ? PLAN_HINTS : PUSH_HINTS;
};

export function CommitPrompt(props: { readonly color: RoleColor; readonly shown: CommitShown }) {
  return (
    <PromptFrame
      color={props.color}
      approval="auto"
      isWorking={props.shown.kind === "working"}
      hints={hintsOf(props.shown)}
    >
      <box flexDirection="row">
        <text flexGrow={1} wrapMode="none" truncate fg={props.color("text.heading")}>
          {titleOf(props.shown)}
        </text>
        <Show when={countOf(props.shown)}>
          {(count) => (
            <text flexShrink={0} wrapMode="none" fg={props.color("text.faint")}>
              {count()}
            </text>
          )}
        </Show>
      </box>
      <ShownBody color={props.color} shown={props.shown} />
    </PromptFrame>
  );
}

const commitState = (name: string, shown: CommitShown): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => <CommitPrompt color={color} shown={shown} />),
});

export const PUSH_QUESTION: CommitShown = {
  kind: "push",
  title: "Push 3 commits to origin/main?",
  choice: 0,
};

export const COMMIT_PLAN: CommitShown = { kind: "plan", commits: PLAN };

export const COMMIT_STATES: readonly [EntryState, ...EntryState[]] = [
  commitState("Running checks", { kind: "working", text: "Running 3 checks" }),
  commitState("Planning", { kind: "working", text: "Planning commits with openai/gpt-5.4-mini" }),
  commitState("Plan to approve", COMMIT_PLAN),
  commitState("Committing", { kind: "working", text: "Committing 2 of 3, hooks included" }),
  commitState("Push question", PUSH_QUESTION),
];
