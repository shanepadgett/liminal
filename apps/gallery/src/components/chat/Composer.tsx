/**
 * Where the user writes. No box: a gutter of marks runs down the left of the draft, the first a
 * bold chevron and the rest fading from light accent to dark. Notifications stack above, then the
 * menu a draft trigger opens, such as `/`, then inputs waiting for the turn. Below is the model
 * line and, on the right, the hints of the keys that act now, cut to `ctrl+g more` when they do not
 * fit. An ask, such as an approval, takes the whole composer's place until the user answers it,
 * with its own hints.
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

/** The keys every draft offers last: the thinking level, then quitting. */
const ALWAYS_HINTS: readonly Hint[] = [
  { keys: "shift+tab", label: "thinking" },
  { keys: "ctrl+q", label: "quit" },
];

/** Enter and esc, which come first; an open menu takes both without hints. */
const importantHints = (hasText: boolean, isWorking: boolean, isMenuOpen: boolean): Hint[] => {
  if (isMenuOpen) return [];

  const enter = hasText ? [{ keys: "enter", label: isWorking ? "steer" : "send" }] : [];

  return isWorking ? [...enter, { keys: "esc", label: "stop" }] : enter;
};

/** Tab completes in an open menu; else, while a turn runs, it queues a follow-up. */
const tabHints = (hasText: boolean, isWorking: boolean, isMenuOpen: boolean): Hint[] => {
  if (isMenuOpen) return [{ keys: "tab", label: "complete" }];

  return hasText && isWorking ? [{ keys: "tab", label: "follow-up" }] : [];
};

/** The hints the product shows for a draft, a turn, the inputs waiting and an open menu. */
export const composerHintsOf = (
  draft: string,
  isWorking: boolean,
  queued: number,
  isMenuOpen = false,
): readonly Hint[] => {
  const hasText = draft !== "";

  const editing: Hint[] = hasText
    ? [
        { keys: "shift+enter", label: "new line" },
        ...tabHints(hasText, isWorking, isMenuOpen),
        { keys: "ctrl+c", label: "clear" },
      ]
    : [];

  return [
    ...importantHints(hasText, isWorking, isMenuOpen),
    ...editing,
    ...(queued > 0 ? [{ keys: "alt+up", label: "edit queued" }] : []),
    ...(hasText ? [{ keys: "ctrl+s", label: "stash" }] : []),
    ...ALWAYS_HINTS,
  ];
};

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
      <span style={{ fg: color("text.faint") }}>{props.input.text.split("\n")[0]}</span>
    </text>
  );
}

/** `model • thinking`; with no provider connected, where to connect one. */
function ModelLine(props: {
  readonly model?: string | undefined;
  readonly thinking?: string | undefined;
}) {
  const color = useColor();

  return (
    <Show
      when={props.model}
      fallback={
        <text wrapMode="none">
          <span style={{ fg: color("text.muted") }}>/connect</span>
          <span style={{ fg: color("text.faint") }}> to link a provider</span>
        </text>
      }
    >
      {(model) => (
        <text wrapMode="none">
          <span style={{ fg: color("text.muted") }}>{model()}</span>
          <Show when={props.thinking}>
            {(thinking) => (
              <>
                <span style={{ fg: color("text.ghost") }}> • </span>
                <span style={{ fg: color("text.faint") }}>{thinking()}</span>
              </>
            )}
          </Show>
        </text>
      )}
    </Show>
  );
}

/** An ask in the composer's place: its body, then its own hints on the right. */
function Cover(props: { readonly hints: readonly Hint[]; readonly children: JSX.Element }) {
  return (
    <box flexShrink={0} paddingX={2} paddingTop={1}>
      {props.children}
      <box marginTop={1}>
        <Hints hints={props.hints} end />
      </box>
    </box>
  );
}

export interface ComposerProps {
  readonly draft: string;
  /** Without its provider; none while no provider is connected. */
  readonly model?: string | undefined;
  readonly thinking?: string | undefined;
  /** Inputs sent while a turn runs. */
  readonly queued: readonly Queued[];
  readonly isWorking: boolean;
  /** Notifications, above everything else. */
  readonly notifications?: JSX.Element | undefined;
  /** The menu a draft trigger opens, such as the commands matching a typed `/`. */
  readonly menu?: JSX.Element | undefined;
  /** Shown in the whole composer's place until the user answers it. */
  readonly ask?: JSX.Element | undefined;
  /** The keys that apply now, when an ask or a state the draft cannot tell changes them. */
  readonly hints?: readonly Hint[] | undefined;
}

function Draft(props: ComposerProps) {
  const color = useColor();

  const hints = () =>
    props.hints
    ?? composerHintsOf(props.draft, props.isWorking, props.queued.length, props.menu !== undefined);

  return (
    <box flexShrink={0} paddingX={2} paddingTop={1}>
      {props.notifications}
      {props.menu}
      <For each={props.queued}>{(input) => <QueuedLine input={input} />}</For>
      <box flexDirection="row" height={DRAFT_ROWS}>
        <Gutter rows={DRAFT_ROWS} />
        <textarea
          flexGrow={1}
          initialValue={props.draft}
          placeholder="Ask anything"
          placeholderColor={color("text.ghost")}
          textColor={color("text.base")}
          wrapMode="word"
        />
      </box>
      {/* The hints take the width the model line leaves, three cells from it. */}
      <box flexDirection="row" marginTop={1} gap={3}>
        <ModelLine model={props.model} thinking={props.thinking} />
        <box flexGrow={1} flexBasis={0}>
          <Hints hints={hints()} end />
        </box>
      </box>
    </box>
  );
}

export function Composer(props: ComposerProps) {
  return (
    <Show when={props.ask} fallback={<Draft {...props} />}>
      <Cover hints={props.hints ?? []}>{props.ask}</Cover>
    </Show>
  );
}
