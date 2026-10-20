/**
 * The `/commit` prompt, a custom prompt in the composer's draft area. While checks run, the planner
 * plans and git commits, one muted line says which and esc stops the work. The plan shows one line
 * per commit, its subject then its file count, for enter to commit. The push question offers No
 * first.
 */

import { Effect } from "effect";
import { type Accessor, createSignal, For, Match, Show, Switch } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import { InboxSlots } from "@liminal/inbox/contract";
import {
  enterKeys,
  type Hint,
  Hints,
  hintsPriority,
  ListRow,
  PROMPT_KEYS_PRIORITY,
  PromptPriority,
  type TuiHost,
  useBindings,
  useColor,
} from "@liminal/sdk/tui";

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

/** The plan's size, at the title's right end. */
const countOf = (step: CommitStep | undefined) => {
  const commits = reviewOf(step);
  if (commits === undefined) return "";

  const files = commits.reduce((total, commit) => total + commit.files.length, 0);

  return `${commitsText(commits.length)}, ${filesText(files)}`;
};

const WORKING_HINTS: readonly Hint[] = [["esc", "stop"]];

const REVIEW_HINTS: readonly Hint[] = [
  ["enter", "commit"],
  ["esc", "cancel"],
];

const SCROLL_HINTS: readonly Hint[] = [
  ["↑↓", "scroll"],
  ["enter", "commit"],
  ["esc", "cancel"],
];

const PUSH_HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "answer"],
  ["esc", "no"],
];

/** Committing and pushing finish whatever the user does, so they have no keys to show. */
const hintsOf = (step: CommitStep | undefined): readonly Hint[] => {
  const commits = reviewOf(step);
  if (commits !== undefined) return commits.length > SHOWN_ROWS ? SCROLL_HINTS : REVIEW_HINTS;
  if (isPush(step)) return PUSH_HINTS;

  const stoppable =
    step === undefined || CommitStep.$is("Checking")(step) || CommitStep.$is("Planning")(step);

  return stoppable ? WORKING_HINTS : [];
};

const clamp = (value: number, last: number) => Math.min(Math.max(value, 0), Math.max(last, 0));

function PlanLines(props: {
  readonly commits: ReadonlyArray<PlannedCommit>;
  readonly top: number;
}) {
  const color = useColor();

  return (
    <box flexDirection="column" marginTop={1}>
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
    <box flexDirection="column" marginTop={1}>
      <For each={PUSH_CHOICES}>
        {(label, index) => (
          <ListRow color={color} isSelected={index() === props.choice}>
            <text fg={color(index() === props.choice ? "text.base" : "text.muted")}>{label}</text>
          </ListRow>
        )}
      </For>
    </box>
  );
}

/** The prompt's keys: the plan and the push question move and answer; esc cancels at any step. */
const useCommitKeys = (flow: CommitFlow, dialogOpen: Accessor<boolean>) => {
  const [top, setTop] = createSignal(0);
  const [choice, setChoice] = createSignal(0);

  const move = (by: number) => {
    const step = flow.step();
    const commits = reviewOf(step);
    if (isPush(step)) setChoice(clamp(choice() + by, 1));
    if (commits !== undefined) setTop(clamp(top() + by, commits.length - SHOWN_ROWS));
  };

  const answer = () => {
    const step = flow.step();
    if (reviewOf(step) !== undefined) flow.answer(true);
    if (isPush(step)) flow.answer(choice() === 1);
  };

  useBindings(() => ({
    priority: PROMPT_KEYS_PRIORITY,
    commands: [
      { name: "commit.answer", run: answer },
      { name: "commit.cancel", run: flow.cancel },
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
    bindings: dialogOpen()
      ? []
      : [
          ...enterKeys("commit.answer"),
          { key: "escape", cmd: "commit.cancel" },
          { key: "up", cmd: "commit.up" },
          { key: "down", cmd: "commit.down" },
        ],
  }));

  return { top, choice };
};

function CommitPrompt(props: {
  readonly flow: CommitFlow;
  readonly dialogOpen: Accessor<boolean>;
}) {
  const color = useColor();
  const { top, choice } = useCommitKeys(props.flow, props.dialogOpen);
  const step = () => props.flow.step();

  return (
    <box flexDirection="column" marginBottom={1}>
      <box flexDirection="row">
        <text flexGrow={1} wrapMode="none" truncate fg={color("text.heading")}>
          {titleOf(step())}
        </text>
        <Show when={countOf(step())}>
          {(count) => (
            <text flexShrink={0} wrapMode="none" fg={color("text.faint")}>
              {count()}
            </text>
          )}
        </Show>
      </box>
      <Switch>
        <Match when={workingText(step())}>
          {(text) => (
            <text marginTop={1} fg={color("text.muted")}>
              {text()}
            </text>
          )}
        </Match>
        <Match when={isPush(step())}>
          <PushChoices choice={choice()} />
        </Match>
        <Match when={reviewOf(step())}>
          {(commits) => <PlanLines commits={commits()} top={top()} />}
        </Match>
      </Switch>
    </box>
  );
}

/** The prompt in the composer's draft area and its key hints, while a `/commit` runs. */
export const registerPrompt = (
  host: TuiHost["Service"],
  flow: Accessor<CommitFlow | undefined>,
  dialogOpen: Accessor<boolean>,
) => {
  const select = () => (flow() === undefined ? undefined : true);
  const priority = PromptPriority.commit;

  return Effect.gen(function* () {
    yield* host.register(InboxSlots.input, { select, priority }, function Prompt() {
      // Keyed, so each `/commit` starts afresh.
      return (
        <Show when={flow()} keyed>
          {(running) => <CommitPrompt flow={running} dialogOpen={dialogOpen} />}
        </Show>
      );
    });

    yield* host.register(
      ChatSlots.composerHints,
      { select, priority: hintsPriority(priority) },
      function PromptHints() {
        const color = useColor();

        return <Hints color={color} hints={hintsOf(flow()?.step())} />;
      },
    );
  });
};
