/**
 * The `/commit` dialog: the rule glides while checks run, the planner plans and git commits; the
 * plan shows one line per commit to approve; the push question offers No first.
 */

import { createSignal, For, Match, Switch } from "solid-js";

import { DialogFrame, enterKeys, type Hint, useBindings, useColor } from "@liminal/sdk/tui";

import { commitsText, type PlannedCommit } from "../contract.ts";
import { type CommitFlow, CommitStep } from "./flow.ts";

/** Plan lines in view at once; up and down scroll the rest. */
const SHOWN_ROWS = 10;

const PUSH_CHOICES = ["No, keep them local", "Yes, push"];

const filesText = (count: number) => (count === 1 ? "1 file" : `${count} files`);

const subjectOf = (commit: PlannedCommit) => commit.message.split("\n")[0] ?? "";

const isPush = (step: CommitStep | undefined) => step !== undefined && CommitStep.$is("Push")(step);

const titleOf = (step: CommitStep | undefined) =>
  step !== undefined && CommitStep.$is("Push")(step)
    ? `Push ${commitsText(step.count)} to ${step.target}?`
    : "Commit";

/** A step that waits for the user has no working line. */
const waiting = () => "";

/** The line a working step shows, or empty when the step waits for the user. */
export const workingText = (step: CommitStep | undefined): string =>
  step === undefined
    ? "Starting"
    : CommitStep.$match(step, {
        Checking: ({ count }) => (count === 0 ? "Checking for changes" : `Running ${count} checks`),
        Planning: ({ model }) => `Planning commits with ${model}`,
        Committing: ({ index, count }) => `Committing ${index + 1} of ${count}, hooks included`,
        Pushing: ({ count, target }) => `Pushing ${commitsText(count)} to ${target}`,
        Review: waiting,
        Push: waiting,
      });

const reviewOf = (step: CommitStep | undefined) =>
  step !== undefined && CommitStep.$is("Review")(step) ? step.commits : undefined;

const REVIEW_HINTS: readonly Hint[] = [["enter", "commit"]];

const SCROLL_HINTS: readonly Hint[] = [
  ["↑↓", "scroll"],
  ["enter", "commit"],
];

const PUSH_HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "answer"],
];

const hintsOf = (step: CommitStep | undefined): readonly Hint[] => {
  const commits = reviewOf(step);
  if (commits !== undefined) return commits.length > SHOWN_ROWS ? SCROLL_HINTS : REVIEW_HINTS;

  return isPush(step) ? PUSH_HINTS : [];
};

const clamp = (value: number, last: number) => Math.min(Math.max(value, 0), Math.max(last, 0));

function PlanLines(props: {
  readonly commits: ReadonlyArray<PlannedCommit>;
  readonly top: number;
}) {
  const color = useColor();

  return (
    <box flexDirection="column">
      <For each={props.commits.slice(props.top, props.top + SHOWN_ROWS)}>
        {(commit) => (
          <box flexDirection="row" gap={2} height={1}>
            <text flexGrow={1} flexShrink={1} wrapMode="none" fg={color("text.base")}>
              {subjectOf(commit)}
            </text>
            <text flexShrink={0} wrapMode="none" fg={color("text.faint")}>
              {filesText(commit.files.length)}
            </text>
          </box>
        )}
      </For>
    </box>
  );
}

function PushChoices(props: { readonly choice: number }) {
  const color = useColor();

  return (
    <box flexDirection="column">
      <For each={PUSH_CHOICES}>
        {(label, index) => (
          <box
            height={1}
            marginX={-1}
            paddingX={1}
            backgroundColor={index() === props.choice ? color("surface.selected") : "transparent"}
          >
            <text fg={color(index() === props.choice ? "text.base" : "text.muted")}>{label}</text>
          </box>
        )}
      </For>
    </box>
  );
}

export function CommitDialog(props: { readonly flow: CommitFlow }) {
  const color = useColor();
  const [top, setTop] = createSignal(0);
  const [choice, setChoice] = createSignal(0);

  const move = (by: number) => {
    const step = props.flow.step();
    const commits = reviewOf(step);
    if (isPush(step)) setChoice(clamp(choice() + by, 1));
    if (commits !== undefined) setTop(clamp(top() + by, commits.length - SHOWN_ROWS));
  };

  const answer = () => {
    const step = props.flow.step();
    if (reviewOf(step) !== undefined) props.flow.answer(true);
    if (isPush(step)) props.flow.answer(choice() === 1);
  };

  useBindings(() => ({
    commands: [
      { name: "commit.answer", run: answer },
      {
        name: "commit.up",
        run: () => {
          move(-1);
        },
      },
      {
        name: "commit.down",
        run: () => {
          move(1);
        },
      },
    ],
    bindings: [
      ...enterKeys("commit.answer"),
      { key: "up", cmd: "commit.up" },
      { key: "down", cmd: "commit.down" },
    ],
  }));

  return (
    <DialogFrame
      title={titleOf(props.flow.step())}
      isWorking={workingText(props.flow.step()) !== ""}
      hints={hintsOf(props.flow.step())}
      close={props.flow.cancel}
    >
      <Switch>
        <Match when={workingText(props.flow.step())}>
          {(text) => <text fg={color("text.muted")}>{text()}</text>}
        </Match>
        <Match when={isPush(props.flow.step())}>
          <PushChoices choice={choice()} />
        </Match>
        <Match when={reviewOf(props.flow.step())}>
          {(commits) => <PlanLines commits={commits()} top={top()} />}
        </Match>
      </Switch>
    </DialogFrame>
  );
}
