/**
 * What shows under the live line while an action runs: the newest lines of a command's output, the
 * lines an edit is writing, and each check ticking off. All of it is gone once the action is done.
 */

import { For } from "solid-js";

import type { RoleColor, RoleName } from "../tokens/roles.ts";
import type { Check, DiffLine } from "./script.ts";

/** A command shows only its newest lines; the rest scrolls away. */
const OUTPUT_LINES = 2;

const shownCount = (total: number, progress: number) => Math.ceil(progress * total);

const outputRole = (line: string): RoleName =>
  line.trimStart().startsWith("✗") ? "feedback.danger" : "text.faint";

export function OutputTail(props: {
  readonly color: RoleColor;
  readonly output: readonly string[];
  readonly progress: number;
}) {
  const lines = () =>
    props.output.slice(0, shownCount(props.output.length, props.progress)).slice(-OUTPUT_LINES);

  return (
    <box flexDirection="column">
      <For each={lines()}>
        {(line) => (
          <text wrapMode="none" truncate fg={props.color(outputRole(line))}>
            {line}
          </text>
        )}
      </For>
    </box>
  );
}

const DIFF_SIGN: Readonly<Record<DiffLine["change"], string>> = {
  added: "+",
  removed: "-",
  kept: " ",
};

const DIFF_ROLE: Readonly<Record<DiffLine["change"], RoleName>> = {
  added: "feedback.success",
  removed: "feedback.danger",
  kept: "text.ghost",
};

export function DiffPeek(props: {
  readonly color: RoleColor;
  readonly diff: readonly DiffLine[];
  readonly progress: number;
}) {
  return (
    <box flexDirection="column">
      <For each={props.diff.slice(0, shownCount(props.diff.length, props.progress))}>
        {(line) => (
          <text wrapMode="none" truncate fg={props.color(DIFF_ROLE[line.change])}>
            {`${DIFF_SIGN[line.change]} ${line.text}`}
          </text>
        )}
      </For>
    </box>
  );
}

type CheckState = "waiting" | "passed" | "failed";

const CHECK_MARK: Readonly<
  Record<CheckState, { readonly glyph: string; readonly role: RoleName }>
> = {
  waiting: { glyph: "·", role: "text.ghost" },
  passed: { glyph: "✓", role: "feedback.success" },
  failed: { glyph: "✗", role: "feedback.danger" },
};

const stateOf = (check: Check, index: number, finished: number): CheckState => {
  if (index >= finished) return "waiting";

  return check.hasPassed ? "passed" : "failed";
};

export function CheckRow(props: {
  readonly color: RoleColor;
  readonly checks: readonly Check[];
  readonly progress: number;
}) {
  const finished = () => Math.floor(props.progress * (props.checks.length + 0.5));

  return (
    <text wrapMode="none" truncate>
      <For each={props.checks}>
        {(check, index) => {
          const state = () => stateOf(check, index(), finished());

          return (
            <>
              <span style={{ fg: props.color(CHECK_MARK[state()].role) }}>
                {CHECK_MARK[state()].glyph}
              </span>
              <span
                style={{ fg: props.color(state() === "waiting" ? "text.ghost" : "text.faint") }}
              >{` ${check.name}   `}</span>
            </>
          );
        }}
      </For>
    </text>
  );
}
