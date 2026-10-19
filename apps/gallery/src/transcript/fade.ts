/**
 * How a streaming answer splits while it is written: the paragraphs that have settled render as
 * Markdown, and the paragraph still being written is inked so its newest characters warm up from
 * the background. A paragraph settles once its last character has warmed up. While a code fence is
 * open, nothing is inked: the code renders as Markdown, a whole word at a time.
 */

import type { Streaming } from "./frame.ts";
import { FRESH_CHARS } from "./ink.ts";

/** Bold and italic markers, left out of the inked paragraph since it is not Markdown yet. */
const EMPHASIS = /\*\*|__/g;

export type Faded =
  /** All of it as Markdown: finished, or inside a code fence. */
  | { readonly kind: "markdown"; readonly text: string }
  | {
      readonly kind: "inked";
      /** The settled paragraphs, as Markdown; empty before the first one settles. */
      readonly settled: string;
      /**
       * The paragraph being written, whole, its markers dropped; the one before it too while its
       * last characters warm up.
       */
      readonly live: string;
      /** How many of the paragraph's characters are out, backticks not counted. */
      readonly shown: number;
    };

const plain = (text: string) => text.replaceAll(EMPHASIS, "");

/** Characters the ink draws: everything but backticks. */
const inkLength = (text: string) => text.replaceAll("`", "").length;

const isFenceOpen = (text: string) => (text.match(/```/g)?.length ?? 0) % 2 === 1;

/** The text written so far, up to the last whole word. */
const wholeWords = (text: string, head: number) => {
  const wordStart = text.slice(0, head).search(/\S+$/);

  return wordStart === -1 ? text.slice(0, head) : text.slice(0, wordStart);
};

/** The answer split at `streaming.progress`. */
export const fadedOf = (streaming: Streaming): Faded => {
  const { text } = streaming;
  if (streaming.progress >= 1) return { kind: "markdown", text };

  const head = Math.floor(streaming.progress * (text.length + FRESH_CHARS));
  if (isFenceOpen(text.slice(0, head))) return { kind: "markdown", text: wholeWords(text, head) };

  const breakAt = text.slice(0, Math.max(0, head - FRESH_CHARS)).lastIndexOf("\n\n");
  const start = breakAt === -1 ? 0 : breakAt + 2;
  // The paragraph the head is in; a paragraph still warming up is inked along with it.
  const nextBreak = text.indexOf("\n\n", Math.max(start, head));
  const end = nextBreak === -1 ? text.length : nextBreak;

  return {
    kind: "inked",
    settled: text.slice(0, Math.max(0, breakAt)),
    live: plain(text.slice(start, end)),
    shown: inkLength(plain(text.slice(start, Math.max(start, head)))),
  };
};
