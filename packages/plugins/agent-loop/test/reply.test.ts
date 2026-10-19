/** A reply's live state while it streams. */

import { expect, test } from "bun:test";

import { applyEvent, emptyReply, liveData } from "../src/server/reply.ts";

test("a finished text part keeps its text in the live state until the reply is saved", () => {
  const started = applyEvent(emptyReply, { type: "part-start", index: 0, part: { type: "text" } });
  const written = applyEvent(started, { type: "delta", index: 0, text: "Let me look." });

  const ended = applyEvent(written, {
    type: "part-end",
    index: 0,
    part: { type: "text", text: "Let me look.", providerData: {} },
  });

  const calling = applyEvent(ended, {
    type: "part-start",
    index: 1,
    part: { type: "tool-call", id: "c1", name: "read" },
  });

  expect(liveData(calling)).toEqual({
    parts: [
      { type: "text", text: "Let me look.", done: true },
      { type: "tool-call", id: "c1", name: "read", text: "" },
    ],
  });
});
