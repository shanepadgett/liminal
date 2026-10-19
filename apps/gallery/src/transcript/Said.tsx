/**
 * What the assistant says, between actions or as its answer, rendered as Markdown in the normal
 * text color so it always stands out from the work around it. The paragraph being written fades in:
 * its newest characters surface from the background and warm up to the text color, and the rest of
 * the word being written is laid out unseen, so words never jump lines. Once a paragraph has
 * settled it renders as Markdown.
 */

import { For, Show } from "solid-js";

import {
  type Faded,
  inkedOf,
  inkRunsAt,
  markdownOf,
  READING_WIDTH,
  type RoleColor,
  useMarkdownDiagrams,
  useMarkdownStyle,
} from "@liminal/sdk/tui";

import { fadedOf } from "./fade.ts";
import type { Streaming } from "./frame.ts";

type Inked = Extract<Faded, { readonly kind: "inked" }>;

function Markdown(props: {
  readonly color: RoleColor;
  readonly text: string;
  readonly streaming: boolean;
}) {
  const style = useMarkdownStyle(() => props.color);
  const diagrams = useMarkdownDiagrams(() => props.color);

  return (
    <markdown
      content={props.text}
      syntaxStyle={style()}
      renderNode={diagrams()}
      fg={props.color("text.base")}
      maxWidth={READING_WIDTH}
      streaming={props.streaming}
      conceal
    />
  );
}

/** The paragraph being written, inked from the background up. */
function Live(props: { readonly color: RoleColor; readonly faded: Inked }) {
  const runs = () =>
    inkRunsAt(props.faded.live, props.faded.shown, {
      text: props.color("text.base"),
      code: props.color("text.accent"),
      ground: props.color("surface.base"),
    });

  return (
    <text wrapMode="word" maxWidth={READING_WIDTH}>
      <For each={runs()}>{(run) => <span style={{ fg: run.fg }}>{run.text}</span>}</For>
    </text>
  );
}

export function Said(props: { readonly color: RoleColor; readonly streaming: Streaming }) {
  const faded = () => fadedOf(props.streaming);

  return (
    <Show
      when={inkedOf(faded())}
      fallback={
        <Markdown
          color={props.color}
          text={markdownOf(faded())}
          streaming={props.streaming.progress < 1}
        />
      }
    >
      {(now) => (
        <box flexDirection="column" gap={1}>
          <Show when={now().settled !== ""}>
            <Markdown color={props.color} text={now().settled} streaming />
          </Show>
          <Live color={props.color} faded={now()} />
        </box>
      )}
    </Show>
  );
}
