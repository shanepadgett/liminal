/**
 * How streaming text is inked. The newest characters arrive dim and warm up to their color over the
 * last few characters, so text seems to surface rather than print. The rest of the word being
 * written is laid out but drawn in the background color, so a word never jumps to the next line
 * halfway through. Text between backticks is code, in its own color, with the backticks dropped.
 */

import { mixHex } from "./tokens/oklch.ts";

/** Characters this close behind the newest one are still warming up. */
export const FRESH_CHARS = 16;

export type Run = { readonly text: string; readonly fg: string };

export type Inks = {
  readonly text: string;
  readonly code: string;
  /** The background: where arriving characters start from, and the color of unwritten ones. */
  readonly ground: string;
};

type Char = { readonly char: string; readonly isCode: boolean };

const charsOf = (text: string): readonly Char[] =>
  text
    .split("`")
    .flatMap((part, index) => part.split("").map((char) => ({ char, isCode: index % 2 === 1 })));

/** Where the word being written ends: the next space or line break at or after `shown`. */
const wordEndOf = (chars: readonly Char[], shown: number) => {
  const next = chars.findIndex((char, index) => index >= shown && /\s/.test(char.char));

  return next === -1 ? chars.length : next;
};

const colorOf = (char: Char, index: number, shown: number, inks: Inks) => {
  if (index >= shown) return inks.ground;

  const settled = char.isCode ? inks.code : inks.text;
  const age = shown - index;

  return age >= FRESH_CHARS ? settled : mixHex(inks.ground, settled, age / FRESH_CHARS);
};

/** The end of the word the head is in, so the whole word can be laid out before it is written. */
export const wordEndAt = (text: string, head: number) => wordEndOf(charsOf(text), head);

/** Text inked with `shown` characters out, counted from its start. */
export const inkRunsAt = (text: string, shown: number, inks: Inks): readonly Run[] => {
  const chars = charsOf(text);
  const runs: Run[] = [];

  for (const [index, char] of chars.slice(0, wordEndOf(chars, shown)).entries()) {
    const fg = colorOf(char, index, shown, inks);
    const last = runs.at(-1);

    if (last?.fg === fg) runs[runs.length - 1] = { text: last.text + char.char, fg };
    else runs.push({ text: char.char, fg });
  }

  return runs;
};

/** Bold and italic markers, left out of the inked paragraph since it is not Markdown yet. */
const EMPHASIS = /\*\*|__/g;

export type Faded =
  /** All of it as Markdown, while a code fence is open. */
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

/** The inked split, or undefined while all of it is Markdown. */
export const inkedOf = (faded: Faded) => (faded.kind === "inked" ? faded : undefined);

/** The Markdown of a split that is all Markdown; empty for an inked one. */
export const markdownOf = (faded: Faded) => (faded.kind === "markdown" ? faded.text : "");

const plain = (text: string) => text.replaceAll(EMPHASIS, "");

/** Characters the ink draws: everything but backticks. */
const inkLength = (text: string) => text.replaceAll("`", "").length;

const isFenceOpen = (text: string) => (text.match(/```/g)?.length ?? 0) % 2 === 1;

/** The text written so far, up to the last whole word. */
const wholeWords = (text: string, head: number) => {
  const wordStart = text.slice(0, head).search(/\S+$/);

  return wordStart === -1 ? text.slice(0, head) : text.slice(0, wordStart);
};

/**
 * How a streaming answer splits with `head` characters out: the paragraphs that have settled render
 * as Markdown, and the paragraph still being written is inked so its newest characters warm up from
 * the background. A paragraph settles once its last character has warmed up. While a code fence is
 * open, nothing is inked: the text renders as Markdown, a whole word at a time.
 */
export const fadeAt = (text: string, head: number): Faded => {
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
