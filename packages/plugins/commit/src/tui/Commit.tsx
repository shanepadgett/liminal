/**
 * `/commit`'s ask, in the draft's place. While the small model plans, Porter says so. The plan
 * lists each commit's subject with its files under it, for enter to commit or esc to cancel. While
 * git commits, each subject gets a mark: done with its hash, the current one in accent, the rest
 * waiting. Then the push question offers No first.
 */
import type { BoxRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { createSignal, For, Match, onMount, Show, Switch } from "solid-js";

import type { RoleName } from "@shanepadgett/liminal-client";
import { Ask } from "@shanepadgett/liminal-questions/tui";
import { keymapCommand, kit, useColor, useHintsWithin } from "@shanepadgett/liminal-tui";

import { type ChangedFile, commitsText, type PlannedCommit } from "../contract.ts";
import { type CommitFlow, CommitStep } from "./flow.ts";
import { commandsOf, KEYS, SHOWN_COMMITS } from "./keys.ts";

/** Files under each commit; the rest are counted. */
const SHOWN_FILES = 3;

const PUSH_CHOICES = ["No, keep them local", "Yes, push"];

const PUSH_COLUMNS = kit.labelColumnsOf(PUSH_CHOICES);

/** The letter git's short status gives each kind of change. */
const LETTERS: Record<ChangedFile["status"], string> = {
  added: "A",
  untracked: "A",
  modified: "M",
  conflicted: "M",
  deleted: "D",
  renamed: "R",
};

const LETTER_ROLES: Record<string, RoleName> = {
  A: "feedback.success",
  M: "feedback.warning",
  D: "feedback.danger",
  R: "feedback.info",
};

const plural = (count: number, one: string) => (count === 1 ? `1 ${one}` : `${count} ${one}s`);

const subjectOf = (commit: PlannedCommit) => commit.message.split("\n")[0] ?? "";

const fileCount = (commits: ReadonlyArray<PlannedCommit>) =>
  commits.flatMap((commit) => commit.files).length;

const titleOf = CommitStep.$match({
  Planning: () => "Commit",
  Review: () => "Commit these changes?",
  Committing: () => "Commit",
  Push: ({ count, target }) => `Push ${commitsText(count)} to ${target}?`,
  Pushing: () => "Push",
});

const asideOf = CommitStep.$match({
  Planning: ({ files }) => plural(files, "file"),
  Review: ({ commits }) => `${commitsText(commits.length)} · ${plural(fileCount(commits), "file")}`,
  Committing: ({ commits, hashes }) => `committing ${hashes.length + 1} of ${commits.length}`,
  Push: () => "",
  Pushing: () => "",
});

function FileLine(props: { readonly file: ChangedFile }) {
  const color = useColor();
  const letter = () => LETTERS[props.file.status];

  return (
    <text wrapMode="none" truncate>
      <span style={{ fg: color(LETTER_ROLES[letter()] ?? "text.faint") }}>
        {`   ${letter()}  `}
      </span>
      <span style={{ fg: color("text.faint") }}>{props.file.path}</span>
    </text>
  );
}

function PlanCommit(props: { readonly commit: PlannedCommit; readonly number: number }) {
  const color = useColor();
  const more = () => props.commit.files.length - SHOWN_FILES;

  return (
    <box>
      <text wrapMode="none" truncate>
        <span style={{ fg: color("text.faint") }}>{`${props.number}  `}</span>
        <span style={{ fg: color("text.base") }}>{subjectOf(props.commit)}</span>
      </text>
      <For each={props.commit.files.slice(0, SHOWN_FILES)}>
        {(file) => <FileLine file={file} />}
      </For>
      <Show when={more() > 0}>
        <text fg={color("text.ghost")}>{`      +${more()} more`}</text>
      </Show>
    </box>
  );
}

function Plan(props: { readonly commits: ReadonlyArray<PlannedCommit>; readonly top: number }) {
  const color = useColor();
  const below = () => props.commits.length - props.top - SHOWN_COMMITS;

  return (
    <box>
      <Show when={props.top > 0}>
        <text fg={color("text.ghost")}>{`↑ ${plural(props.top, "more commit")}`}</text>
      </Show>
      <For each={props.commits.slice(props.top, props.top + SHOWN_COMMITS)}>
        {(commit, index) => <PlanCommit commit={commit} number={props.top + index() + 1} />}
      </For>
      <Show when={below() > 0}>
        <text fg={color("text.ghost")}>{`↓ ${plural(below(), "more commit")}`}</text>
      </Show>
    </box>
  );
}

/** A commit git has not made: the current one in accent, the rest faint. */
function Pending(props: { readonly commit: PlannedCommit; readonly isCurrent: boolean }) {
  const color = useColor();

  return (
    <text wrapMode="none" truncate>
      <span style={{ fg: color(props.isCurrent ? "text.accent" : "text.ghost") }}>
        {props.isCurrent ? "◌  " : "·  "}
      </span>
      <span style={{ fg: color(props.isCurrent ? "text.base" : "text.faint") }}>
        {subjectOf(props.commit)}
      </span>
    </text>
  );
}

/** One commit while git works: done with its hash, current, or waiting. */
function Progress(props: {
  readonly commit: PlannedCommit;
  readonly hash: string | undefined;
  readonly isCurrent: boolean;
}) {
  const color = useColor();

  return (
    <Show
      when={props.hash}
      fallback={<Pending commit={props.commit} isCurrent={props.isCurrent} />}
    >
      {(hash) => (
        <box flexDirection="row" gap={2}>
          <text flexGrow={1} wrapMode="none" truncate>
            <span style={{ fg: color("feedback.success") }}>{"✓  "}</span>
            <span style={{ fg: color("text.muted") }}>{subjectOf(props.commit)}</span>
          </text>
          <text flexShrink={0} fg={color("text.faint")}>
            {hash()}
          </text>
        </box>
      )}
    </Show>
  );
}

function Committing(props: {
  readonly commits: ReadonlyArray<PlannedCommit>;
  readonly hashes: ReadonlyArray<string>;
}) {
  return (
    <box>
      <For each={props.commits}>
        {(commit, index) => (
          <Progress
            commit={commit}
            hash={props.hashes[index()]}
            isCurrent={index() === props.hashes.length}
          />
        )}
      </For>
    </box>
  );
}

function PushChoices(props: { readonly choice: number }) {
  return (
    <For each={PUSH_CHOICES}>
      {(label, index) => (
        <kit.ChoiceRow
          label={label}
          labelColumns={PUSH_COLUMNS}
          isUnder={index() === props.choice}
        />
      )}
    </For>
  );
}

function Body(props: { readonly step: CommitStep; readonly top: number; readonly choice: number }) {
  return (
    <Switch>
      <Match when={CommitStep.$is("Planning")(props.step) && props.step}>
        {(step) => <kit.Porter words={[`planning commits with ${step().model}`]} />}
      </Match>
      <Match when={CommitStep.$is("Review")(props.step) && props.step}>
        {(step) => <Plan commits={step().commits} top={props.top} />}
      </Match>
      <Match when={CommitStep.$is("Committing")(props.step) && props.step}>
        {(step) => <Committing commits={step().commits} hashes={step().hashes} />}
      </Match>
      <Match when={CommitStep.$is("Push")(props.step)}>
        <PushChoices choice={props.choice} />
      </Match>
      <Match when={CommitStep.$is("Pushing")(props.step) && props.step}>
        {(step) => (
          <kit.Porter words={[`pushing ${commitsText(step().count)} to ${step().target}`]} />
        )}
      </Match>
    </Switch>
  );
}

export function Commit(props: { readonly flow: CommitFlow }) {
  const [top, setTop] = createSignal(0);
  const [choice, setChoice] = createSignal(0);
  let root: BoxRenderable | undefined;

  useBindings(() => ({
    target: () => root,
    commands: commandsOf(props.flow, { top, setTop, choice, setChoice }).map(keymapCommand),
    bindings: KEYS,
  }));

  const hints = useHintsWithin(() => root);

  onMount(() => {
    root?.focus();
  });

  return (
    <box
      ref={(made) => {
        root = made;
      }}
      focusable
      flexShrink={0}
      paddingX={2}
      paddingTop={1}
    >
      <Show when={props.flow.step()}>
        {(step) => (
          <Ask mark="◇" markRole="text.accent" title={titleOf(step())} aside={asideOf(step())}>
            <Body step={step()} top={top()} choice={choice()} />
          </Ask>
        )}
      </Show>
      <box marginTop={1}>
        <kit.Hints hints={hints()} end />
      </box>
    </box>
  );
}
