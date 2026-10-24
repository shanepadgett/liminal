/**
 * `/commit`'s ask, in the draft's place once the turn has ended. While the small model plans,
 * Porter says so. The plan lists each commit's subject with its files under it, for enter to commit
 * or esc to cancel. While git commits, each subject gets a mark: done with its hash, the current
 * one in accent, the rest waiting. Then the push question offers No first, as `Choices`. Every
 * ending is one notification.
 */

import { For, Match, Show, Switch } from "solid-js";

import { type Choice, Choices, choicesHintsOf } from "../../primitives/Choices.tsx";
import type { Hint } from "../../primitives/Hints.tsx";
import { Porter } from "../../primitives/Porter.tsx";
import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";
import { Ask } from "./Ask.tsx";

/** How git sees a file: added, modified, deleted or renamed. */
export type FileStatus = "A" | "M" | "D" | "R";

export interface PlannedFile {
  readonly status: FileStatus;
  readonly path: string;
}

export interface PlannedCommit {
  readonly subject: string;
  readonly files: readonly PlannedFile[];
}

/** Each step of `/commit` the ask shows. */
export type CommitStep =
  | { readonly kind: "planning"; readonly files: number; readonly model: string }
  | {
      readonly kind: "review";
      readonly commits: readonly PlannedCommit[];
      /** The first commit in view. */
      readonly top: number;
    }
  | {
      readonly kind: "committing";
      readonly commits: readonly PlannedCommit[];
      /** The hashes of the commits made so far, in order. */
      readonly hashes: readonly string[];
    }
  | {
      readonly kind: "push";
      readonly count: number;
      readonly target: string;
      readonly choice: number;
    }
  | { readonly kind: "pushing"; readonly count: number; readonly target: string };

/** Commits in view at once; up and down scroll the rest. */
export const SHOWN_COMMITS = 4;

/** Files under each commit; the rest are counted. */
const SHOWN_FILES = 3;

const PUSH_CHOICES: readonly Choice[] = [
  { label: "No, keep them local", hint: "keep local" },
  { label: "Yes, push", hint: "push" },
];

const STATUS_ROLES: Record<FileStatus, RoleName> = {
  A: "feedback.success",
  M: "feedback.warning",
  D: "feedback.danger",
  R: "feedback.info",
};

const plural = (count: number, one: string) => (count === 1 ? `1 ${one}` : `${count} ${one}s`);

const fileCount = (commits: readonly PlannedCommit[]) =>
  commits.flatMap((commit) => commit.files).length;

const titleOf = (step: CommitStep) => {
  if (step.kind === "push") return `Push ${plural(step.count, "commit")} to ${step.target}?`;
  if (step.kind === "review") return "Commit these changes?";
  if (step.kind === "pushing") return "Push";

  return "Commit";
};

const asideOf = (step: CommitStep) => {
  if (step.kind === "planning") return plural(step.files, "file");

  if (step.kind === "committing") {
    return `committing ${step.hashes.length + 1} of ${step.commits.length}`;
  }

  if (step.kind === "review") {
    return `${plural(step.commits.length, "commit")} · ${plural(fileCount(step.commits), "file")}`;
  }

  return "";
};

function FileLine(props: { readonly file: PlannedFile }) {
  const color = useColor();

  return (
    <text wrapMode="none" truncate>
      <span
        style={{ fg: color(STATUS_ROLES[props.file.status]) }}
      >{`   ${props.file.status}  `}</span>
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
        <span style={{ fg: color("text.base") }}>{props.commit.subject}</span>
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

function Plan(props: { readonly commits: readonly PlannedCommit[]; readonly top: number }) {
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
        {props.commit.subject}
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
            <span style={{ fg: color("text.muted") }}>{props.commit.subject}</span>
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
  readonly commits: readonly PlannedCommit[];
  readonly hashes: readonly string[];
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

export function Commit(props: { readonly step: CommitStep }) {
  return (
    <Ask mark="◇" markRole="text.accent" title={titleOf(props.step)} aside={asideOf(props.step)}>
      <Switch>
        <Match when={props.step.kind === "planning" && props.step}>
          {(step) => <Porter words={[`planning commits with ${step().model}`]} />}
        </Match>
        <Match when={props.step.kind === "review" && props.step}>
          {(step) => <Plan commits={step().commits} top={step().top} />}
        </Match>
        <Match when={props.step.kind === "committing" && props.step}>
          {(step) => <Committing commits={step().commits} hashes={step().hashes} />}
        </Match>
        <Match when={props.step.kind === "push" && props.step}>
          {(step) => <Choices choices={PUSH_CHOICES} under={step().choice} />}
        </Match>
        <Match when={props.step.kind === "pushing" && props.step}>
          {(step) => (
            <Porter words={[`pushing ${plural(step().count, "commit")} to ${step().target}`]} />
          )}
        </Match>
      </Switch>
    </Ask>
  );
}

/** Committing and pushing finish whatever the user does, so they show no keys. */
export const commitHintsOf = (step: CommitStep): readonly Hint[] => {
  if (step.kind === "planning") return [{ keys: "esc", label: "stop" }];

  if (step.kind === "push") {
    return [...choicesHintsOf(PUSH_CHOICES, step.choice), { keys: "esc", label: "no" }];
  }

  if (step.kind !== "review") return [];

  const scroll = step.commits.length > SHOWN_COMMITS ? [{ keys: "↑↓", label: "scroll" }] : [];

  return [...scroll, { keys: "enter", label: "commit" }, { keys: "esc", label: "cancel" }];
};
