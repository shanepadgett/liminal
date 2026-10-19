import { expect, test } from "bun:test";

import { fadedOf } from "./fade.ts";
import { FRESH_CHARS } from "./ink.ts";

const text = "First **bold** part.\n\nSecond `code` part.";

/** The progress that puts the head `head` characters in. */
const at = (head: number) => ({ text, progress: head / (text.length + FRESH_CHARS) });

test("the paragraph being written is inked without its markers", () => {
  expect(fadedOf(at(9))).toEqual({
    kind: "inked",
    settled: "",
    live: "First bold part.",
    shown: 7,
  });
});

test("a finished paragraph is inked with the next one until it warms up, then settles", () => {
  const start = text.indexOf("Second");

  expect(fadedOf(at(start + 2))).toMatchObject({
    settled: "",
    live: "First bold part.\n\nSecond `code` part.",
  });

  expect(fadedOf(at(start + FRESH_CHARS))).toMatchObject({
    settled: "First **bold** part.",
    live: "Second `code` part.",
    // Two of the characters out are backticks.
    shown: FRESH_CHARS - 2,
  });
});

test("finished text and open code fences render as Markdown", () => {
  expect(fadedOf({ text, progress: 1 })).toEqual({ kind: "markdown", text });

  const fenced = "Run:\n\n```\nbun test\n```";
  const head = fenced.indexOf("test");

  expect(fadedOf({ text: fenced, progress: head / (fenced.length + FRESH_CHARS) })).toEqual({
    kind: "markdown",
    text: "Run:\n\n```\nbun ",
  });
});
