/**
 * The checkpoint draws its rule with space around it, counts the files it read back and shows the
 * handoff and those files only in the debug view.
 */

import { expect, test } from "bun:test";

import { testRender } from "@opentui/solid";

import { PALETTES, resolveRoles } from "@liminal/sdk/tui";

import {
  Checkpoint,
  type CheckpointMessage,
  type RestoredFiles,
  RestoredLine,
} from "../src/transcript/Checkpoint.tsx";

const [palette] = PALETTES;
const color = resolveRoles(palette);

const HANDOFF = "Two of five files are done.\n\n- Next: machine.test.ts";

const linesOf = async (
  isDebug: boolean,
  isFolded: boolean,
  checkpoint: CheckpointMessage = { handoff: HANDOFF, restored: 0 },
) => {
  const setup = await testRender(
    () => (
      <Checkpoint
        color={color}
        checkpoint={checkpoint}
        isDebug={isDebug}
        isFolded={isFolded}
        onToggle={() => {}}
      />
    ),
    { width: 60, height: 10 },
  );

  await setup.renderOnce();
  const lines = setup.captureCharFrame().split("\n");
  setup.renderer.destroy();

  return lines.map((line) => line.trimEnd());
};

test("the rule has a blank line above and below and hides the handoff", async () => {
  const lines = await linesOf(false, true);

  expect(lines[0]).toBe("");
  expect(lines[1]).toContain("─ Checkpoint ─");
  expect(lines.slice(2).join("")).toBe("");
});

test("the debug view shows the handoff's first line under the rule", async () => {
  const lines = await linesOf(true, true);

  expect(lines[2]).toBe("");
  expect(lines[3]).toBe("▸ Handoff  Two of five files are done.");
  expect(lines.join("\n")).not.toContain("machine.test.ts");
});

test("an unfolded handoff shows in full", async () => {
  const lines = await linesOf(true, false);

  expect(lines[3]).toBe("▾ Handoff");
  expect(lines.join("\n")).toContain("- Next: machine.test.ts");
});

test("an automatic checkpoint draws only the rule, even in the debug view", async () => {
  const lines = await linesOf(true, true, { restored: 0 });

  expect(lines[1]).toContain("─ Checkpoint ─");
  expect(lines.join("\n")).not.toContain("Handoff");
});

test("the rule counts the files read back", async () => {
  const many = await linesOf(false, true, { restored: 6 });
  const one = await linesOf(false, true, { restored: 1 });

  expect(many[1]).toContain("─ Checkpoint · 6 files read ─");
  expect(one[1]).toContain("─ Checkpoint · 1 file read ─");
});

const RESTORED: RestoredFiles = {
  files: [
    { path: "src/boot.ts", lines: "all" },
    { path: "src/machine.ts", lines: "40–112" },
  ],
  leftOut: ["src/contracts.ts"],
};

const restoredLinesOf = async (isFolded: boolean) => {
  const setup = await testRender(
    () => (
      <RestoredLine color={color} restored={RESTORED} isFolded={isFolded} onToggle={() => {}} />
    ),
    { width: 60, height: 6 },
  );

  await setup.renderOnce();
  const lines = setup.captureCharFrame().split("\n");
  setup.renderer.destroy();

  return lines.map((line) => line.trimEnd());
};

test("the files read back fold to a count", async () => {
  const lines = await restoredLinesOf(true);

  expect(lines[0]).toBe("▸ Files  2 read, 1 left out");
  expect(lines.slice(1).join("")).toBe("");
});

test("unfolded, each file shows its lines, then the files left out", async () => {
  const lines = await restoredLinesOf(false);

  expect(lines.slice(0, 4)).toEqual([
    "▾ Files  2 read, 1 left out",
    "  src/boot.ts  all",
    "  src/machine.ts  40–112",
    "  src/contracts.ts  left out",
  ]);
});
