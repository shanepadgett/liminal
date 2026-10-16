/**
 * What the assistant says, between actions or as its answer, rendered as Markdown in the normal
 * text color so it always stands out from the work around it. It arrives a word at a time: the word
 * being written is held back until it is whole, so words never jump lines.
 */

import { SyntaxStyle, type StyleDefinitionInput } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { createMemo, onCleanup } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import type { Streaming } from "./frame.ts";

const stylesOf = (color: RoleColor): Record<string, StyleDefinitionInput> => ({
  default: { fg: color("text.base") },
  "markup.heading": { fg: color("text.heading"), bold: true },
  "markup.strong": { fg: color("text.heading"), bold: true },
  "markup.italic": { italic: true },
  "markup.strikethrough": { fg: color("text.muted") },
  "markup.raw": { fg: color("text.accent") },
  "markup.quote": { fg: color("text.muted"), italic: true },
  "markup.list": { fg: color("text.faint") },
  "markup.link": { fg: color("text.accent"), underline: true },
  "markup.link.label": { fg: color("text.accent") },
  "markup.link.url": { fg: color("text.faint") },
  conceal: { fg: color("text.ghost") },
});

/** The text written so far, up to the last whole word. */
const writtenOf = (streaming: Streaming) => {
  if (streaming.progress >= 1) return streaming.text;

  const head = Math.floor(streaming.progress * streaming.text.length);
  const wordStart = streaming.text.slice(0, head).search(/\S+$/);

  return wordStart === -1 ? streaming.text.slice(0, head) : streaming.text.slice(0, wordStart);
};

export function Said(props: { readonly color: RoleColor; readonly streaming: Streaming }) {
  const renderer = useRenderer();

  const style = createMemo(() => {
    const made = SyntaxStyle.fromStyles(stylesOf(props.color), renderer.nativeScene);

    onCleanup(() => {
      made.destroy();
    });

    return made;
  });

  return (
    <markdown
      content={writtenOf(props.streaming)}
      syntaxStyle={style()}
      fg={props.color("text.base")}
      streaming={props.streaming.progress < 1}
      conceal
    />
  );
}
