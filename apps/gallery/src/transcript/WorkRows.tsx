/**
 * The work between two things the assistant said, one quiet row per group: a mark, the verb in
 * bold, what it worked on, and fainter detail in brackets. Everything is gray but a failure, and it
 * all dims further once the assistant speaks after it or the turn is over. A group of several
 * actions opens on a click to list them, and a thought opens to show what was thought. A script's
 * calls sit under its row, and it opens to show the code. Rows keep their place as the frame is
 * redrawn, so an opened row stays open.
 */

import { TextAttributes } from "@opentui/core";
import { createSignal, For, Index, Show } from "solid-js";

import { type RoleColor, workColor, WorkWords } from "@liminal/sdk/tui";

import { actionWordingsOf, wordingOf } from "./wording.ts";
import { innerGroupsOf, type WorkGroup } from "./workGroups.ts";

/** Opened rows sit under the group's words, past its mark. */
const OPENED_INDENT = 2;

/** A group of several actions is marked apart from a single one. */
const markOf = (group: WorkGroup) => (actionWordingsOf(group).length > 0 ? "◈" : "◆");

function GroupRow(props: {
  readonly color: RoleColor;
  readonly group: WorkGroup;
  readonly dim: number;
}) {
  const [isOpen, setIsOpen] = createSignal(false);

  const actions = () => actionWordingsOf(props.group);
  const thought = () => (props.group.kind === "thought" ? props.group : undefined);
  const script = () => (props.group.kind === "scripted" ? props.group.script : undefined);
  const canOpen = () => actions().length > 0 || thought() !== undefined || script() !== undefined;

  return (
    <box
      flexDirection="column"
      onMouseUp={() => {
        if (canOpen()) setIsOpen((was) => !was);
      }}
    >
      <WorkWords
        color={props.color}
        mark={markOf(props.group)}
        words={wordingOf(props.group, "past")}
        dim={props.dim}
      />
      <Show when={script()}>
        {(ran) => (
          <box paddingLeft={OPENED_INDENT}>
            <WorkRows color={props.color} groups={innerGroupsOf(ran())} dim={props.dim} />
          </box>
        )}
      </Show>
      <Show when={isOpen()}>
        <box flexDirection="column" paddingLeft={OPENED_INDENT}>
          <For each={actions()}>
            {(action) => <WorkWords color={props.color} mark="◆" words={action} dim={props.dim} />}
          </For>
          <Show when={script()}>
            {(ran) => <text fg={workColor(props.color, "thought", props.dim)}>{ran().code}</text>}
          </Show>
          <Show when={thought()}>
            {(thinking) => (
              <text
                fg={workColor(props.color, "thought", props.dim)}
                attributes={TextAttributes.ITALIC}
              >
                {thinking().text}
              </text>
            )}
          </Show>
        </box>
      </Show>
    </box>
  );
}

export function WorkRows(props: {
  readonly color: RoleColor;
  readonly groups: readonly WorkGroup[];
  /** How far the work has dimmed, from 0 to 1. */
  readonly dim: number;
}) {
  return (
    <box flexDirection="column">
      <Index each={props.groups}>
        {(group) => <GroupRow color={props.color} group={group()} dim={props.dim} />}
      </Index>
    </box>
  );
}
