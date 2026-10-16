/**
 * The assistant's thinking at a level: `line` says how long it thought and opens to the thought;
 * `full` is always open; `live` shows the thought trailing after `Thinking` while it goes on.
 */

import { TextAttributes } from "@opentui/core";
import { Show } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { formatDuration } from "./duration.ts";
import type { ThinkingEntry } from "./entries.ts";
import type { DrawnLevel } from "./levels.ts";
import { BODY_INDENT } from "./results/Panel.tsx";

const GLYPH = "∴";

function LiveLine(props: { readonly color: RoleColor; readonly thinking: ThinkingEntry }) {
  return (
    <box flexDirection="row" height={1} gap={1}>
      <text wrapMode="none" flexShrink={0} fg={props.color("text.muted")}>
        {`${GLYPH} Thinking`}
      </text>
      <text
        wrapMode="none"
        flexShrink={1}
        fg={props.color("text.faint")}
        attributes={TextAttributes.ITALIC}
      >
        {props.thinking.text}
      </text>
    </box>
  );
}

function Thought(props: {
  readonly color: RoleColor;
  readonly thinking: ThinkingEntry;
  readonly isOpen: boolean;
}) {
  return (
    <box flexDirection="column">
      <text wrapMode="none" fg={props.color("text.faint")}>
        {`${GLYPH} Thought for ${formatDuration(props.thinking.seconds)}`}
      </text>
      <Show when={props.isOpen}>
        <text
          marginLeft={BODY_INDENT}
          fg={props.color("text.faint")}
          attributes={TextAttributes.ITALIC}
        >
          {props.thinking.text}
        </text>
      </Show>
    </box>
  );
}

export function Thinking(props: {
  readonly color: RoleColor;
  readonly thinking: ThinkingEntry;
  readonly level: DrawnLevel;
  readonly isOpen: boolean;
}) {
  return (
    <Show
      when={props.level !== "live"}
      fallback={<LiveLine color={props.color} thinking={props.thinking} />}
    >
      <Thought
        color={props.color}
        thinking={props.thinking}
        isOpen={props.level === "full" || props.isOpen}
      />
    </Show>
  );
}
