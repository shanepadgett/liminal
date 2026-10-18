/**
 * How the assistant's streaming thought is inked. The newest characters arrive dim and warm up to
 * their color over the last few characters, so text seems to surface rather than print. The rest of
 * the word being written is laid out but drawn in the background color, so a word never jumps to
 * the next line halfway through. Text between backticks is code, in its own color, with the
 * backticks dropped.
 */

import { mixHex } from "@liminal/sdk/tui";

import type { Streaming } from "./frame.ts";

/** Characters this close behind the newest one are still warming up. */
const FRESH_CHARS = 16;

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

/**
 * How many characters are out: the head runs past the end by the fade's length, so finished text
 * has settled all the way.
 */
export const headOf = (streaming: Streaming) =>
  Math.floor(streaming.progress * (charsOf(streaming.text).length + FRESH_CHARS));

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
