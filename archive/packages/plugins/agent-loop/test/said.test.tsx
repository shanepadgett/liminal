/** Reply text fades in as it streams: the head chases what has arrived, then settles to Markdown. */

import { expect, test } from "bun:test";

import { testRender } from "@opentui/solid";
import { createSignal } from "solid-js";

import { ColorContext, PALETTES, resolveRoles } from "@liminal/sdk/tui";

import { Said } from "../src/tui/Said.tsx";

const [palette] = PALETTES;
const color = resolveRoles(palette);

const frameAfter = async (setup: Awaited<ReturnType<typeof testRender>>, ms: number) => {
  await Bun.sleep(ms);
  await setup.renderOnce();

  return setup.captureCharFrame();
};

test("streamed text appears over a few steps, and a settled paragraph renders as Markdown", async () => {
  const [text, setText] = createSignal("First **bold** part.");

  const setup = await testRender(
    () => (
      <ColorContext.Provider value={color}>
        <Said text={text()} />
      </ColorContext.Provider>
    ),
    { width: 40, height: 8 },
  );

  await setup.renderOnce();
  expect(setup.captureCharFrame()).not.toContain("part.");

  expect(await frameAfter(setup, 400)).toContain("First bold part.");

  setText("First **bold** part.\n\nSecond part.");
  const settled = await frameAfter(setup, 600);
  setup.renderer.destroy();

  expect(settled).toContain("First bold part.");
  expect(settled).toContain("Second part.");
  expect(settled).not.toContain("**");
});

test("settled Markdown wraps at the reading width on a wider screen", async () => {
  const words = Array.from({ length: 50 }, () => "word").join(" ");

  const setup = await testRender(
    () => (
      <ColorContext.Provider value={color}>
        <Said text={`${words}\n\nEnd.`} />
      </ColorContext.Provider>
    ),
    { width: 200, height: 8 },
  );

  await setup.renderOnce();
  const frame = await frameAfter(setup, 800);
  setup.renderer.destroy();

  const widest = Math.max(...frame.split("\n").map((line) => line.trimEnd().length));

  expect(widest).toBeLessThanOrEqual(120);
  expect(widest).toBeGreaterThan(100);
});
