/**
 * How a streaming reply splits with `head` characters out. Paragraphs that have settled render as
 * Markdown; the paragraph being written is inked as plain text, its markers dropped, so its newest
 * characters warm up from the background. While a code fence is open, nothing is inked: the text
 * renders as Markdown, a whole word at a time.
 */

import { cellsOf } from "../../primitives/Gradient.tsx";
import { FRESH_CELLS } from "../../primitives/Ink.tsx";

export type Split =
  | { readonly kind: "markdown"; readonly text: string }
  | {
      readonly kind: "inked";
      /** The settled paragraphs, as Markdown; empty before the first one settles. */
      readonly settled: string;
      /** The paragraph being written, whole, without its markers. */
      readonly live: string;
      /** How many of the live paragraph's cells are out. */
      readonly shown: number;
    };

const MARKERS = /\*\*|__|`/g;

const plain = (text: string) => text.replaceAll(MARKERS, "");

const isFenceOpen = (text: string) => (text.match(/```/g)?.length ?? 0) % 2 === 1;

/** The text written so far, up to the last whole word. */
const wholeWords = (text: string, head: number) => {
  const wordStart = text.slice(0, head).search(/\S+$/);

  return wordStart === -1 ? text.slice(0, head) : text.slice(0, wordStart);
};

export const splitAt = (text: string, head: number): Split => {
  if (head >= text.length + FRESH_CELLS) return { kind: "markdown", text };

  if (isFenceOpen(text.slice(0, head))) return { kind: "markdown", text: wholeWords(text, head) };

  // A paragraph settles once its last characters have warmed up.
  const breakAt = text.slice(0, Math.max(0, head - FRESH_CELLS)).lastIndexOf("\n\n");
  const start = breakAt === -1 ? 0 : breakAt + 2;
  const nextBreak = text.indexOf("\n\n", Math.max(start, head));
  const end = nextBreak === -1 ? text.length : nextBreak;

  return {
    kind: "inked",
    settled: text.slice(0, Math.max(0, breakAt)),
    live: plain(text.slice(start, end)),
    shown: cellsOf(plain(text.slice(start, Math.max(start, head)))).length,
  };
};
