/**
 * The model's words, drawn as Markdown with its lists, tables and Mermaid diagrams. While they
 * stream, the paragraph being written inks in above the ones that have settled.
 */

import { Match, Show, Switch } from "solid-js";

import { kit, useColor, useSyntax } from "@shanepadgett/liminal-tui";

import { useDiagrams } from "./diagrams.ts";
import { splitAt } from "./stream.ts";

function Markdown(props: { readonly text: string; readonly isStreaming: boolean }) {
  const syntax = useSyntax();
  const color = useColor();
  const diagrams = useDiagrams();

  return (
    <markdown
      content={props.text}
      streaming={props.isStreaming}
      syntaxStyle={syntax()}
      fg={color("text.base")}
      conceal
      renderNode={diagrams()}
      tableOptions={{
        style: "grid",
        widthMode: "content",
        cellPaddingX: 1,
        borderColor: color("border.base"),
        borderStyle: "rounded",
      }}
    />
  );
}

export function Reply(props: {
  readonly text: string;
  /** How many characters have streamed in; all of them, settled, when left out. */
  readonly streamed?: number | undefined;
}) {
  const split = () => splitAt(props.text, props.streamed ?? Number.POSITIVE_INFINITY);

  const markdown = () => {
    const current = split();

    return current.kind === "markdown" ? current : undefined;
  };

  const inked = () => {
    const current = split();

    return current.kind === "inked" ? current : undefined;
  };

  return (
    <Switch>
      <Match when={markdown()}>
        {(whole) => <Markdown text={whole().text} isStreaming={props.streamed !== undefined} />}
      </Match>
      <Match when={inked()}>
        {(live) => (
          <box gap={1}>
            <Show when={live().settled !== ""}>
              <Markdown text={live().settled} isStreaming />
            </Show>
            <kit.Inked text={live().live} shown={live().shown} role="text.base" />
          </box>
        )}
      </Match>
    </Switch>
  );
}
