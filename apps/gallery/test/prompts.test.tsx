/**
 * Custom prompts take the composer's place: the approval prompt shows the reviewer's summary or the
 * subject, who else waits and the reject note; the commit prompt keeps the model line and its own
 * key hints.
 */

import { expect, test } from "bun:test";

import { type JSX, testRender } from "@opentui/solid";

import { PALETTES, resolveRoles } from "@liminal/sdk/tui";

import { ApprovalPrompt } from "../src/chat/ApprovalPrompt.tsx";
import { COMMIT_PLAN, CommitPrompt } from "../src/chat/CommitPrompt.tsx";

const [palette] = PALETTES;
const color = resolveRoles(palette);

const ASK = {
  tool: "shell",
  subject: "rm -rf dist",
  reason: "the command is not on the safe list",
};

const frameOf = async (view: () => JSX.Element) => {
  const setup = await testRender(view, { width: 80, height: 14 });

  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  setup.renderer.destroy();

  return frame;
};

test("the approval prompt shows the subject when the review wrote no summary, and who waits", async () => {
  const frame = await frameOf(() => (
    <ApprovalPrompt
      color={color}
      approval="ask"
      ask={ASK}
      waiting={2}
      isRejecting={false}
      note=""
    />
  ));

  expect(frame).toContain("Run shell?");
  expect(frame).toContain("2 more waiting");
  expect(frame).toContain("rm -rf dist");
  expect(frame).toContain("approval ask");
  expect(frame).toContain("enter approve");
});

test("rejecting opens the note line under Reject", async () => {
  const frame = await frameOf(() => (
    <ApprovalPrompt color={color} approval="ask" ask={ASK} waiting={0} isRejecting note="" />
  ));

  expect(frame).toContain("Tell the agent why");
  expect(frame).toContain("enter reject");
  expect(frame).not.toContain("more waiting");
});

test("the commit plan lists each commit with its file count", async () => {
  const frame = await frameOf(() => <CommitPrompt color={color} shown={COMMIT_PLAN} />);

  expect(frame).toContain("3 commits, 14 files");
  expect(frame).toContain("feat: add commit plugin");
  expect(frame).toContain("1 file");
  expect(frame).toContain("enter commit");
});
