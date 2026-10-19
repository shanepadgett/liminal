/** Folding followed events into the transcript, and tool calls into work rows. */

import { describe, expect, test } from "bun:test";

import { DateTime, Schema } from "effect";

import {
  type FollowEvent,
  type SavedEntry,
  SavedEvent,
  Seq,
  SessionId,
  Synced,
} from "@liminal/sdk";

import { ToolRows } from "../src/contract.ts";
import {
  emptyTranscript,
  fold,
  isLeftBehind,
  type Step,
  titleOf,
  type Transcript,
} from "../src/tui/transcript-state.ts";
import { groupsOf } from "../src/tui/work.ts";

const at = DateTime.makeUnsafe(0);

let seq = 0;

const saved = (
  kind: string,
  data: SavedEntry["data"],
  user: SavedEntry["user"] = "shown",
): FollowEvent =>
  SavedEvent.make({
    entry: {
      sessionId: SessionId.make("s1"),
      seq: Seq.make(++seq),
      kind,
      at,
      data,
      text: kind,
      user,
    },
  });

/** The transcript after every one of `events`. */
const folded = (events: ReadonlyArray<FollowEvent>) => {
  let transcript = emptyTranscript;
  for (const event of events) transcript = fold(transcript, event);

  return transcript;
};

const call = (id: string, name: string, path: string) =>
  saved("session-log/tool-call", { id, name, params: { path } });

const result = (callId: string, name: string, status: string) =>
  saved("session-log/tool-result", { callId, name, status, result: "" });

const innerCall = (id: string, path: string) =>
  saved(
    "session-log/inner-call",
    { outer: "c1", id, name: "read", params: { path }, status: "done", result: "" },
    "hidden",
  );

const pathOf = Schema.decodeUnknownSync(Schema.Struct({ path: Schema.String }));

const read = ToolRows.Rows({
  fold: (each) => ({
    verb: "Read",
    subject: pathOf(each.params).path,
    joins: { verb: "Explored", noun: "files" },
  }),
});

/** The tool calls of the work item at `index`. */
const callsAt = (transcript: Transcript, index: number) => {
  const work = transcript.items[index];
  if (work?.kind !== "work") throw new Error("expected work");

  return work.steps.flatMap((step) => (step.kind === "call" ? [step.call] : []));
};

const stepsOf = (transcript: Transcript, index: number): ReadonlyArray<Step> => {
  const work = transcript.items[index];
  if (work?.kind !== "work") throw new Error("expected work");

  return work.steps;
};

describe("transcript", () => {
  test("gathers consecutive tool calls and pairs their results", () => {
    const events = [
      saved("session-log/turn-started", {}, "hidden"),
      saved("session-log/user", { text: "hi" }),
      call("c1", "read", "a.ts"),
      call("c2", "read", "b.ts"),
      result("c1", "read", "done"),
      result("c2", "read", "failed"),
      saved("session-log/text", { text: "ok", interrupted: false }),
      new Synced({}),
    ];

    const transcript = folded(events);

    expect(transcript.running).toBe(true);
    expect(transcript.synced).toBe(true);
    expect(transcript.items.map((item) => item.kind)).toEqual(["entry", "work", "entry"]);

    expect(callsAt(transcript, 1).map((each) => each.outcome?.status)).toEqual(["done", "failed"]);

    const groups = groupsOf(stepsOf(transcript, 1), (name) => (name === "read" ? read : undefined));

    expect(groups.map((group) => group.words)).toEqual([
      { verb: "Explored", subject: "2 files", detail: "", failure: "1 failed", oneLine: false },
    ]);
  });

  test("a turn's end stops it running; unworded tools read as their name", () => {
    const transcript = folded([
      saved("session-log/turn-started", {}, "hidden"),
      call("c1", "shell", "x"),
      saved("session-log/turn-ended", { end: "answered" }, "hidden"),
    ]);

    expect(transcript.running).toBe(false);
    expect(groupsOf(stepsOf(transcript, 0), () => {})[0]?.words.verb).toBe("shell");
  });

  test("a hidden tool's calls draw no row", () => {
    const calls: ReadonlyArray<Step> = [
      { kind: "call", call: { id: "c1", name: "read", params: { path: "a.ts" } } },
      { kind: "call", call: { id: "c2", name: "checkpoint", params: { handoff: "next" } } },
    ];

    const groups = groupsOf(calls, (name) => (name === "read" ? read : ToolRows.Hidden({})));

    expect(groups.map((group) => group.words.verb)).toEqual(["Read"]);
    expect(groupsOf(calls.slice(1), () => ToolRows.Hidden({}))).toEqual([]);
  });

  test("a run script's inner calls sit under their outer call", () => {
    const transcript = folded([
      call("c1", "run", ""),
      innerCall("c1/1", "a.ts"),
      innerCall("c1/2", "b.ts"),
      result("c1", "run", "done"),
    ]);

    const calls = callsAt(transcript, 0);
    const [run] = calls;
    expect(calls.map((each) => each.id)).toEqual(["c1"]);
    expect(run?.outcome?.status).toBe("done");
    const inner = run?.inner ?? [];
    expect(inner.map((each) => each.id)).toEqual(["c1/1", "c1/2"]);
    expect(inner[0]?.outcome?.status).toBe("done");
  });

  test("keeps debug entries, drops hidden ones, and joins calls past debug entries", () => {
    const transcript = folded([
      call("c1", "shell", "x"),
      saved("approval/answer", { approved: true }, "debug"),
      saved("other/hidden", {}, "hidden"),
      call("c2", "shell", "y"),
      result("c2", "shell", "done"),
    ]);

    expect(transcript.items.map((item) => item.kind)).toEqual(["work", "entry"]);
    const [, answer] = transcript.items;
    const calls = callsAt(transcript, 0);
    expect(calls.map((each) => each.id)).toEqual(["c1", "c2"]);
    expect(calls[1]?.outcome?.status).toBe("done");
    expect(answer?.kind === "entry" ? answer.entry.user : undefined).toBe("debug");
  });

  test("thoughts join the run of work, end a joined row, and show their title", () => {
    const thought = (text: string) => saved("session-log/reasoning", { text, interrupted: false });

    const transcript = folded([
      saved("session-log/turn-started", {}, "hidden"),
      thought("**Reading the host**\n\nI should read it."),
      call("c1", "read", "a.ts"),
      thought(""),
      call("c2", "read", "b.ts"),
      thought("**Checking tests**\n\nNext."),
      call("c3", "read", "c.ts"),
    ]);

    expect(transcript.items.map((item) => item.kind)).toEqual(["work"]);

    const groups = groupsOf(stepsOf(transcript, 0), (name) => (name === "read" ? read : undefined));

    expect(groups.map((group) => `${group.words.verb} ${group.words.subject}`)).toEqual([
      "Thought Reading the host",
      "Explored 2 files",
      "Thought Checking tests",
      "Read c.ts",
    ]);
  });

  test("the title is the first user line until the model names the session", () => {
    const prompted = folded([saved("session-log/user", { text: "  fix the login bug\nit loops" })]);
    expect(titleOf(prompted)).toBe("fix the login bug");

    const later = fold(prompted, saved("session-log/user", { text: "and the logout" }));
    expect(titleOf(later)).toBe("fix the login bug");

    const named = fold(
      later,
      saved("session-log/named", { name: "Fixing a login redirect loop" }, "debug"),
    );

    expect(titleOf(named)).toBe("Fixing a login redirect loop");

    const renamed = fold(
      named,
      saved("session-log/named", { name: "Fixing login and logout" }, "debug"),
    );

    expect(titleOf(renamed)).toBe("Fixing login and logout");

    expect(titleOf(emptyTranscript)).toBe("");
  });

  test("work is left behind once someone speaks after it or the turn ends", () => {
    const working = folded([
      saved("session-log/turn-started", {}, "hidden"),
      call("c1", "read", "a.ts"),
    ]);

    expect(isLeftBehind(working, 0)).toBe(false);

    const spoken = fold(working, saved("session-log/text", { text: "ok", interrupted: false }));
    expect(isLeftBehind(spoken, 0)).toBe(true);

    const ended = fold(working, saved("session-log/turn-ended", { end: "answered" }, "hidden"));
    expect(isLeftBehind(ended, 0)).toBe(true);
  });
});
