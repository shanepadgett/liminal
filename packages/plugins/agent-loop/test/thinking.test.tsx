/**
 * Live thinking: a live line saying `Thinking`, and the summary fading in under it without its
 * marks.
 */

import { expect, test } from "bun:test";

import { testRender } from "@opentui/solid";

import { LiveLine, PALETTES, resolveRoles, Vapor } from "@liminal/sdk/tui";

import { plainOf } from "../src/tui/live.tsx";

const [palette] = PALETTES;
const color = resolveRoles(palette);

const render = (head: number) => {
  const text = plainOf("**Reading the host**\n\nI should read it.");

  return testRender(
    () => (
      <box flexDirection="column">
        <LiveLine color={color} label="Thinking" seconds={0} />
        <Vapor color={color} text={text} head={head} />
      </box>
    ),
    { width: 60, height: 6 },
  );
};

test("a summary reads as plain words one space apart", () => {
  expect(plainOf("**Reading the host**\n\nI should read it.")).toBe(
    "Reading the host I should read it.",
  );
});

test("the summary shows only as far as its ink is out", async () => {
  const setup = await render(4);
  await setup.renderOnce();
  await setup.renderOnce();
  const frame = setup.captureCharFrame();

  expect(frame).toContain("Thinking");
  expect(frame).not.toContain("read it.");
});

test("a settled summary shows whole, under the live line", async () => {
  const setup = await render(200);
  await setup.renderOnce();
  await setup.renderOnce();
  const frame = setup.captureCharFrame();

  expect(frame).toContain("Thinking");
  expect(frame).toContain("Reading the host I should read it.");
  expect(frame).not.toContain("*");
});
