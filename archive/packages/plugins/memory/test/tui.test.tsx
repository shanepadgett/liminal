/** Memory's TUI: the checkpoint rule's file count, the debug Files line and the Context rows. */

import { expect, test } from "bun:test";

import { testRender } from "@opentui/solid";
import { DateTime, Option, type Schema } from "effect";
import type { JSX } from "solid-js";

import { type SavedEntry, Seq, SessionId } from "@liminal/sdk";
import { ColorContext, PALETTES, resolveRoles } from "@liminal/sdk/tui";

import { IdleTrigger, type MemoryStatus } from "../src/contract.ts";
import { Checkpoint } from "../src/tui/Checkpoint.tsx";
import { makeContextRows } from "../src/tui/ContextRows.tsx";
import { RestoredLine } from "../src/tui/DebugLine.tsx";

const [palette] = PALETTES;
const color = resolveRoles(palette);
const s1 = SessionId.make("s1");

const entryOf = (kind: string, data: Schema.Json): SavedEntry => ({
  sessionId: s1,
  seq: Seq.make(1),
  kind,
  at: DateTime.makeUnsafe(0),
  data,
  text: "",
  user: "debug",
});

const frameOf = async (view: () => JSX.Element, width = 60) => {
  const setup = await testRender(
    () => <ColorContext.Provider value={color}>{view()}</ColorContext.Provider>,
    { width, height: 8 },
  );

  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  setup.renderer.destroy();

  return frame;
};

/** A checkpoint saved before checkpoints counted restored files. */
const oldCheckpoint = {
  trigger: IdleTrigger.make({ idleSeconds: 600 }),
  shortTerm: [],
  tailFrom: 1,
};

test("the checkpoint rule counts the files it read back, and an old checkpoint reads none", async () => {
  const counted = await frameOf(() => (
    <Checkpoint entry={entryOf("memory/checkpoint", { ...oldCheckpoint, restored: 6 })} />
  ));

  const old = await frameOf(() => (
    <Checkpoint entry={entryOf("memory/checkpoint", oldCheckpoint)} />
  ));

  expect(counted).toContain("─ Checkpoint · 6 files read ─");
  expect(old).toContain("─ Checkpoint ─");
});

test("the debug Files line folds to its counts", async () => {
  const frame = await frameOf(() => (
    <RestoredLine
      entry={entryOf("memory/restored", {
        files: [{ path: "a.ts", ranges: [], text: "x" }],
        leftOut: ["b.ts"],
      })}
    />
  ));

  expect(frame).toContain("▸ Files  1 read, 1 left out");
});

test("the Context rows show the budget and memory counts once a turn has run", async () => {
  const status: MemoryStatus = {
    size: 150_000,
    budget: 200_000,
    stage: "warning",
    shortTerm: 4,
    longTerm: 1,
    checkpoints: 2,
  };

  const Rows = makeContextRows(() => () => Option.some(status));
  const Empty = makeContextRows(() => () => Option.none());

  const frame = await frameOf(() => <Rows sessionId={s1} />, 40);
  const empty = await frameOf(() => <Empty sessionId={s1} />, 40);

  for (const label of ["budget", "short-term", "long-term", "checkpoints"])
    expect(frame).toContain(label);

  expect(frame).toContain("75%");
  expect(empty.trim()).toBe("");
});
