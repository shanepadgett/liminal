/**
 * Reply text as it arrives: the paragraphs that have settled as Markdown, and the paragraph being
 * written inked, its newest characters warming up from the background.
 */

import { For, Show } from "solid-js";

import {
  fadeAt,
  inkedOf,
  inkRunsAt,
  markdownOf,
  useColor,
  useMarkdownDiagrams,
  useMarkdownStyle,
} from "@liminal/sdk/tui";

import { createHead } from "./head.ts";

function Markdown(props: { readonly text: string }) {
  const color = useColor();
  const style = useMarkdownStyle(() => color);
  const diagrams = useMarkdownDiagrams(() => color);

  return (
    <markdown
      content={props.text}
      syntaxStyle={style()}
      renderNode={diagrams()}
      fg={color("text.base")}
      streaming
      conceal
    />
  );
}

/**
 * Reply text as it arrives: settled paragraphs as Markdown, the paragraph being written inked from
 * the background up.
 */
export function Said(props: { readonly text: string }) {
  const color = useColor();
  const head = createHead(() => props.text);
  const faded = () => fadeAt(props.text, head());

  const runs = (live: string, shown: number) =>
    inkRunsAt(live, shown, {
      text: color("text.base"),
      code: color("text.accent"),
      ground: color("surface.base"),
    });

  return (
    <Show when={inkedOf(faded())} fallback={<Markdown text={markdownOf(faded())} />}>
      {(now) => (
        <box flexDirection="column" gap={1}>
          <Show when={now().settled !== ""}>
            <Markdown text={now().settled} />
          </Show>
          <text wrapMode="word">
            <For each={runs(now().live, now().shown)}>
              {(run) => <span style={{ fg: run.fg }}>{run.text}</span>}
            </For>
          </text>
        </box>
      )}
    </Show>
  );
}
