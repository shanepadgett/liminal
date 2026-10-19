/**
 * A streaming answer shows its settled paragraphs as Markdown and the paragraph being written
 * inked.
 */

import { expect, test } from "bun:test";

import { testRender } from "@opentui/solid";

import { PALETTES, resolveRoles } from "@liminal/sdk/tui";

import { FRESH_CHARS } from "../src/transcript/ink.ts";
import { Said } from "../src/transcript/Said.tsx";

const [palette] = PALETTES;
const color = resolveRoles(palette);

const TEXT = "First **bold** part.\n\nSecond part is longer.";

test("settled paragraphs render as Markdown while the live one is still written", async () => {
  const head = TEXT.indexOf("is") + FRESH_CHARS;
  const progress = head / (TEXT.length + FRESH_CHARS);

  const setup = await testRender(
    () => <Said color={color} streaming={{ text: TEXT, progress }} />,
    { width: 40, height: 6 },
  );

  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  setup.renderer.destroy();

  expect(frame).toContain("First bold part.");
  expect(frame).not.toContain("**");
  expect(frame).toContain("Second part is");
});
