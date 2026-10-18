/**
 * What the assistant says, between actions or as its answer, rendered as Markdown in the normal
 * text color so it always stands out from the work around it. It arrives a word at a time: the word
 * being written is held back until it is whole, so words never jump lines.
 */

import { type RoleColor, useMarkdownStyle } from "@liminal/sdk/tui";

import type { Streaming } from "./frame.ts";

/** The text written so far, up to the last whole word. */
const writtenOf = (streaming: Streaming) => {
  if (streaming.progress >= 1) return streaming.text;

  const head = Math.floor(streaming.progress * streaming.text.length);
  const wordStart = streaming.text.slice(0, head).search(/\S+$/);

  return wordStart === -1 ? streaming.text.slice(0, head) : streaming.text.slice(0, wordStart);
};

export function Said(props: { readonly color: RoleColor; readonly streaming: Streaming }) {
  const style = useMarkdownStyle(() => props.color);

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
