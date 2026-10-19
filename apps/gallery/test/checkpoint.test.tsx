/** The checkpoint draws its rule with space around it and shows the handoff only in the debug view. */

import { expect, test } from "bun:test";

import { testRender } from "@opentui/solid";

import { PALETTES, resolveRoles } from "@liminal/sdk/tui";

import { Checkpoint, type CheckpointMessage } from "../src/transcript/Checkpoint.tsx";

const [palette] = PALETTES;
const color = resolveRoles(palette);

const HANDOFF = "Two of five files are done.\n\n- Next: machine.test.ts";

const linesOf = async (
  isDebug: boolean,
  isFolded: boolean,
  checkpoint: CheckpointMessage = { handoff: HANDOFF },
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
  const lines = await linesOf(true, true, {});

  expect(lines[1]).toContain("─ Checkpoint ─");
  expect(lines.join("\n")).not.toContain("Handoff");
});
