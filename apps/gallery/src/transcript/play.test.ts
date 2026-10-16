import { describe, expect, it } from "bun:test";

import {
  BETWEEN_TURNS_MS,
  closeMomentOf,
  durationOf,
  frameAt,
  momentOf,
  sessionDurationOf,
  turnsAt,
} from "./play.ts";
import { ASK, FIX } from "./sample.ts";

const dimOfFirst = (ms: number) => {
  const [first] = frameAt(FIX, ms).blocks;

  return first?.kind === "work" ? first.dim : undefined;
};

describe("frameAt", () => {
  it("shows thinking as the tip before anything settles", () => {
    const frame = frameAt(FIX, momentOf(FIX, 0, 0.5));

    expect(frame.blocks).toEqual([]);
    expect(frame.tip.kind).toBe("thinking");
    expect(frame.ending).toBeUndefined();
  });

  it("groups finished thinking and actions until the assistant speaks", () => {
    const frame = frameAt(FIX, momentOf(FIX, 2, 0.5));
    const [work] = frame.blocks;

    expect(frame.blocks.map((block) => block.kind)).toEqual(["work", "said"]);

    expect(work?.kind === "work" && work.groups.map((group) => group.kind)).toEqual([
      "thought",
      "explored",
    ]);

    expect(frame.tip.kind).toBe("quiet");
  });

  it("shows the group an action carries on as the live line, not as a row", () => {
    const frame = frameAt(FIX, momentOf(FIX, 4, 0.5));

    expect(frame.blocks.map((block) => block.kind)).toEqual(["work", "said"]);

    expect(frame.tip.kind === "acting" && frame.tip.group).toMatchObject({
      kind: "edited",
      edits: [{ path: "kernel/test/support.ts" }, { path: "kernel/test/host.test.ts" }],
    });
  });

  it("dims work once the assistant speaks after it", () => {
    expect(dimOfFirst(momentOf(FIX, 1, 0.5))).toBe(0);
    expect(dimOfFirst(momentOf(FIX, 2, 0))).toBe(0);
    expect(dimOfFirst(momentOf(FIX, 2, 1))).toBe(1);
  });

  it("dims all the work once the turn's work is over", () => {
    const dims = frameAt(FIX, durationOf(FIX)).blocks.flatMap((block) =>
      block.kind === "work" ? [block.dim] : [],
    );

    expect(dims.every((dim) => dim === 1)).toBe(true);
  });

  it("drafts the questions as the last of the work", () => {
    const frame = frameAt(ASK, closeMomentOf(ASK, 0.5));

    expect(frame.tip).toEqual({ kind: "drafting", seconds: ASK.close.ms / 2000 });
    expect(frame.ending).toBeUndefined();
  });

  it("leaves the form under how long it worked once drafted", () => {
    const frame = frameAt(ASK, durationOf(ASK));

    expect(frame.tip.kind).toBe("quiet");

    expect(frame.ending?.final).toEqual({
      kind: "questions",
      title: "Before I rewrite the concurrency test",
      count: 4,
    });
  });

  it("ends with how long it worked, then the answer", () => {
    const frame = frameAt(FIX, durationOf(FIX));
    const workMs = momentOf(FIX, FIX.beats.length - 1, 1);

    expect(frame.ending).toMatchObject({
      seconds: workMs / 1000,
      drawn: 1,
      final: { kind: "answer", answer: { progress: 1 } },
    });
  });

  it("inks in how long it worked before the answer starts", () => {
    const frame = frameAt(FIX, closeMomentOf(FIX, 0));

    expect(frame.ending?.drawn).toBe(1);
    expect(frame.ending?.final).toMatchObject({ kind: "answer", answer: { progress: 0 } });
  });
});

describe("turnsAt", () => {
  it("starts the next turn once the last has ended and the user has answered", () => {
    const answering = durationOf(ASK) + BETWEEN_TURNS_MS / 2;
    const answered = durationOf(ASK) + BETWEEN_TURNS_MS + 100;

    expect(turnsAt([ASK, FIX], answering).map((turn) => turn.ms)).toEqual([durationOf(ASK)]);
    expect(turnsAt([ASK, FIX], answered).map((turn) => turn.ms)).toEqual([durationOf(ASK), 100]);

    expect(sessionDurationOf([ASK, FIX])).toBe(
      durationOf(ASK) + BETWEEN_TURNS_MS + durationOf(FIX),
    );
  });
});
