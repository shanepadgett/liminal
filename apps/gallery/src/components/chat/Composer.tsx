/**
 * Where the user writes. No box: a gutter of marks runs down the left of the draft, the first a
 * bold chevron and the rest fading from light accent to dark. Widgets such as notifications stack
 * above, then inputs waiting for the turn, then the commands matching a typed `/`; below is the
 * model with its effort and the keys that apply now. An ask, such as an approval, takes the draft's
 * place until the user answers it.
 */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { For, Show } from "solid-js";

import { gradientOf } from "../../primitives/Gradient.tsx";
import { type Hint, Hints } from "../../primitives/Hints.tsx";
import { useColor } from "../../theme/theme.tsx";

const DRAFT_ROWS = 3;

export const PROMPT = "❯";

const CONTINUATION = "╎";

/** The gutter's marks down `rows` rows, the same whether or not a turn runs. */
export function Gutter(props: { readonly rows: number }) {
  const color = useColor();

  const rows = () => Array.from({ length: props.rows }, (_, row) => row);
  const marks = () => gradientOf(color("gradient.from"), color("gradient.to"), props.rows);

  return (
    <box width={3} flexShrink={0}>
      <For each={rows()}>
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
  { keys: "enter", label: "steer" },
  { keys: "tab", label: "follow-up" },
  { keys: "esc", label: "stop" },
];

/**
 * An input sent while a turn runs. A steer joins the running turn at its next step; a follow-up
 * waits for the turn to end and starts the next one.
 */
export interface Queued {
  readonly kind: "steer" | "follow-up";
  readonly text: string;
}

const QUEUED_MARKS = {
  steer: { mark: "↳", role: "text.accent" },
  "follow-up": { mark: "↓", role: "text.muted" },
} as const;

function QueuedLine(props: { readonly input: Queued }) {
  const color = useColor();
  const look = () => QUEUED_MARKS[props.input.kind];

  return (
    <text wrapMode="none">
      <span style={{ fg: color(look().role) }}>{`${look().mark}  `}</span>
      <span style={{ fg: color("text.faint") }}>{props.input.text}</span>
    </text>
  );
}

function Draft(props: {
  readonly draft: string;
  readonly queued: readonly Queued[];
  readonly suggestions: JSX.Element | undefined;
}) {
  const color = useColor();

  return (
    <>
      <For each={props.queued}>{(input) => <QueuedLine input={input} />}</For>
      {props.suggestions}
      <box flexDirection="row" height={DRAFT_ROWS}>
        <Gutter rows={DRAFT_ROWS} />
        <textarea
          flexGrow={1}
          initialValue={props.draft}
          placeholder="Ask anything, or / for commands"
          placeholderColor={color("text.ghost")}
          textColor={color("text.base")}
          wrapMode="word"
        />
      </box>
    </>
  );
}

export function Composer(props: {
  readonly draft: string;
  readonly model: string;
  readonly effort: string;
  /** Inputs sent while a turn runs. */
  readonly queued: readonly Queued[];
  readonly isWorking: boolean;
  /** Widgets stacked above the draft, such as notifications. */
  readonly widgets?: JSX.Element | undefined;
  /** The commands matching a typed `/`, just above the draft. */
  readonly suggestions?: JSX.Element | undefined;
  /** Shown in the draft's place until the user answers it. */
  readonly ask?: JSX.Element | undefined;
  /** The keys that apply now, when an ask or the commands change them. */
  readonly hints?: readonly Hint[] | undefined;
}) {
  const color = useColor();
  const hints = () => props.hints ?? (props.isWorking ? WORKING_HINTS : IDLE_HINTS);

  return (
    <box flexShrink={0} paddingX={2} paddingTop={1}>
      {props.widgets}
      <Show
        when={props.ask}
        fallback={
          <Draft draft={props.draft} queued={props.queued} suggestions={props.suggestions} />
        }
      >
        {props.ask}
      </Show>
      <box flexDirection="row" marginTop={1} gap={2}>
        <text flexGrow={1} wrapMode="none">
          <span style={{ fg: color("text.accent") }}>◇ </span>
          <span style={{ fg: color("text.muted") }}>{props.model}</span>
          <span style={{ fg: color("text.ghost") }}> • </span>
          <span style={{ fg: color("text.faint") }}>{props.effort}</span>
        </text>
        <Hints hints={hints()} />
      </box>
    </box>
  );
}
