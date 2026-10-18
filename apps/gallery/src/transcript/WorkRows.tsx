/**
 * The work between two things the assistant said, one quiet row per group: a mark, the verb in
 * bold, what it worked on, and fainter detail in brackets. Everything is gray but a failure, and it
 * all dims further once the assistant speaks after it or the turn is over. A group of several
 * actions opens on a click to list them, and a thought opens to show what was thought. Rows keep
 * their place as the frame is redrawn, so an opened row stays open.
 */

import { TextAttributes } from "@opentui/core";
import { createSignal, For, Index, Show } from "solid-js";

import { mixHex, type RoleColor, type RoleName } from "@liminal/sdk/tui";

import { actionWordingsOf, type Wording, wordingOf } from "./wording.ts";
import type { WorkGroup } from "./workGroups.ts";

/** Opened rows sit under the group's words, past its mark. */
const OPENED_INDENT = 2;

/** A group of several actions is marked apart from a single one. */
const markOf = (group: WorkGroup) => (actionWordingsOf(group).length > 0 ? "◈" : "◆");

type Part = "mark" | "verb" | "subject" | "detail" | "failure" | "thought";

/** Each part's role while the work is current, and once it has dimmed. */
const PART_ROLES: Readonly<Record<Part, readonly [RoleName, RoleName]>> = {
  mark: ["text.ghost", "text.ghost"],
  verb: ["text.muted", "text.ghost"],
  subject: ["text.faint", "text.ghost"],
  detail: ["text.ghost", "text.ghost"],
  failure: ["feedback.danger", "feedback.danger.subtle"],
  thought: ["text.faint", "text.ghost"],
};

/** A part's color, `dim` of the way from current to dimmed. */
const partColor = (color: RoleColor, part: Part, dim: number) => {
  const [current, dimmed] = PART_ROLES[part];

  return mixHex(color(current), color(dimmed), dim);
};

const after = (text: string) => (text === "" ? "" : ` ${text}`);

const aside = (text: string) => (text === "" ? "" : ` (${text})`);

export function WordedRow(props: {
  readonly color: RoleColor;
  readonly mark: string;
  readonly wording: Wording;
  readonly dim: number;
}) {
  const fg = (part: Part) => partColor(props.color, part, props.dim);

  return (
    <text>
      <span style={{ fg: fg("mark") }}>{`${props.mark} `}</span>
      <b style={{ fg: fg("verb") }}>{props.wording.verb}</b>
      <span style={{ fg: fg("subject") }}>{after(props.wording.subject)}</span>
      <span style={{ fg: fg("detail") }}>{aside(props.wording.detail)}</span>
      <span style={{ fg: fg("failure") }}>{aside(props.wording.failure)}</span>
    </text>
  );
}

function GroupRow(props: {
  readonly color: RoleColor;
  readonly group: WorkGroup;
  readonly dim: number;
}) {
  const [isOpen, setIsOpen] = createSignal(false);

  const actions = () => actionWordingsOf(props.group);
  const thought = () => (props.group.kind === "thought" ? props.group : undefined);
  const canOpen = () => actions().length > 0 || thought() !== undefined;

  return (
    <box
      flexDirection="column"
      onMouseUp={() => {
        if (canOpen()) setIsOpen((was) => !was);
      }}
    >
      <WordedRow
        color={props.color}
        mark={markOf(props.group)}
        wording={wordingOf(props.group, "past")}
        dim={props.dim}
      />
      <Show when={isOpen()}>
        <box flexDirection="column" paddingLeft={OPENED_INDENT}>
          <For each={actions()}>
            {(action) => (
              <WordedRow color={props.color} mark="◆" wording={action} dim={props.dim} />
            )}
          </For>
          <Show when={thought()}>
            {(thinking) => (
              <text
                fg={partColor(props.color, "thought", props.dim)}
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
