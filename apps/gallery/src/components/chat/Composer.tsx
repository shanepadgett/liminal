/**
 * Where the user writes. No box: a gutter of marks runs down the left of the draft, the first a
 * bold chevron and the rest fading from light accent to dark. Queued inputs sit above, and below is
 * the model with its effort and the keys that apply now.
 */

import { TextAttributes } from "@opentui/core";
import { For } from "solid-js";

import { gradientOf } from "../../primitives/Gradient.tsx";
import { Hints } from "../../primitives/Hints.tsx";
import { useColor } from "../../theme/theme.tsx";

const DRAFT_ROWS = 3;

export const PROMPT = "❯";

const CONTINUATION = "╎";

const ROWS = Array.from({ length: DRAFT_ROWS }, (_, row) => row);

/** The gutter's marks; while a turn runs they go quiet, since what the user types waits. */
function Gutter(props: { readonly isWorking: boolean }) {
  const color = useColor();

  const marks = () =>
    props.isWorking
      ? ROWS.map(() => color("ornament.subtle"))
      : gradientOf(color("gradient.from"), color("gradient.to"), DRAFT_ROWS);

  return (
    <box width={3} flexShrink={0}>
      <For each={ROWS}>
        {(row) => (
          <text
            fg={marks()[row] ?? ""}
            attributes={row === 0 ? TextAttributes.BOLD : TextAttributes.NONE}
          >
            {row === 0 ? PROMPT : CONTINUATION}
          </text>
        )}
      </For>
    </box>
  );
}

const IDLE_HINTS = [
  { keys: "enter", label: "send" },
  { keys: "shift+enter", label: "new line" },
];

const WORKING_HINTS = [
  { keys: "enter", label: "queue" },
  { keys: "esc", label: "stop" },
];

export function Composer(props: {
  readonly draft: string;
  readonly model: string;
  readonly effort: string;
  /** Inputs sent while a turn runs, waiting for it to end. */
  readonly queued: readonly string[];
  readonly isWorking: boolean;
}) {
  const color = useColor();

  return (
    <box flexShrink={0} paddingX={2} paddingTop={1}>
      <For each={props.queued}>
        {(input) => (
          <text wrapMode="none" paddingLeft={3}>
            <span style={{ fg: color("text.accent") }}>• </span>
            <span style={{ fg: color("text.faint") }}>{input}</span>
          </text>
        )}
      </For>
      <box flexDirection="row" height={DRAFT_ROWS}>
        <Gutter isWorking={props.isWorking} />
        <textarea
          flexGrow={1}
          initialValue={props.draft}
          placeholder={props.isWorking ? "Queue a follow-up" : "Ask anything, or / for commands"}
          placeholderColor={color("text.ghost")}
          textColor={color("text.base")}
          wrapMode="word"
        />
      </box>
      <box flexDirection="row" marginTop={1}>
        <text flexGrow={1} wrapMode="none">
          <span style={{ fg: color("text.accent") }}>◇ </span>
          <span style={{ fg: color("text.muted") }}>{props.model}</span>
          <span style={{ fg: color("text.ghost") }}> • </span>
          <span style={{ fg: color("text.faint") }}>{props.effort}</span>
        </text>
        <Hints hints={props.isWorking ? WORKING_HINTS : IDLE_HINTS} />
      </box>
    </box>
  );
}
