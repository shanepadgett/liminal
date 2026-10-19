/**
 * The growing end of a turn: the live line for what the assistant is doing now, the whole group the
 * action carries on (`Exploring kernel/test, 2 files`), with what that action is producing under
 * it. The live line stays mounted from one action to the next, so its light keeps sweeping as the
 * words change under it.
 */

import { Show } from "solid-js";

import { LiveLine, type RoleColor, Vapor } from "@liminal/sdk/tui";

import { CheckRow, DiffPeek, OutputTail } from "./details.tsx";
import type { Tip as TipFrame } from "./frame.ts";
import { headOf } from "./ink.ts";
import type { Action } from "./script.ts";
import { wordingOf } from "./wording.ts";
import type { WorkGroup } from "./workGroups.ts";

/** Lines under the live line sit under its words, past the arc. */
const DETAIL_INDENT = 2;

type Live = {
  readonly label: string;
  readonly seconds: number;
  readonly action: Action | undefined;
  readonly progress: number;
};

/** The group going on now in the present tense: `Exploring kernel/test, 2 files`. */
const doingOf = (group: WorkGroup) => {
  const { verb, subject } = wordingOf(group, "present");

  return subject === "" ? verb : `${verb} ${subject}`;
};

const liveOf = (tip: TipFrame): Live | undefined => {
  if (tip.kind === "thinking") {
    return { label: "Thinking", seconds: tip.seconds, action: undefined, progress: tip.progress };
  }

  if (tip.kind === "acting") {
    return {
      label: doingOf(tip.group),
      seconds: tip.seconds,
      action: tip.action,
      progress: tip.progress,
    };
  }

  if (tip.kind === "drafting") {
    return { label: "Drafting questions", seconds: tip.seconds, action: undefined, progress: 0 };
  }

  return undefined;
};

function ActionDetail(props: {
  readonly color: RoleColor;
  readonly action: Action | undefined;
  readonly progress: number;
}) {
  const running = () => (props.action?.kind === "run" ? props.action : undefined);
  const editing = () => (props.action?.kind === "edit" ? props.action : undefined);
  const checking = () => (props.action?.kind === "checks" ? props.action : undefined);

  return (
    <>
      <Show when={running()}>
        {(run) => (
          <OutputTail color={props.color} output={run().output} progress={props.progress} />
        )}
      </Show>
      <Show when={editing()}>
        {(edit) => <DiffPeek color={props.color} diff={edit().diff} progress={props.progress} />}
      </Show>
      <Show when={checking()}>
        {(ran) => <CheckRow color={props.color} checks={ran().checks} progress={props.progress} />}
      </Show>
    </>
  );
}

export function Tip(props: { readonly color: RoleColor; readonly tip: TipFrame }) {
  const thinking = () => (props.tip.kind === "thinking" ? props.tip : undefined);

  return (
    <box flexDirection="column">
      <Show when={liveOf(props.tip)}>
        {(live) => (
          <box flexDirection="column" marginTop={1}>
            <LiveLine color={props.color} label={live().label} seconds={live().seconds} />
            <box flexDirection="column" paddingLeft={DETAIL_INDENT}>
              <Show when={thinking()}>
                {(thought) => (
                  <Vapor color={props.color} text={thought().text} head={headOf(thought())} />
                )}
              </Show>
              <ActionDetail color={props.color} action={live().action} progress={live().progress} />
            </box>
          </box>
        )}
      </Show>
    </box>
  );
}
