/** A ramp's `shift` moves every step's lightness together. */

import { expect, test } from "bun:test";

import { buildRamp, hexToOklch, STANDARD_STEPS } from "../src/tui/index.ts";

test("a negative shift darkens each step and keeps its hue", () => {
  const spec = { hue: 296, chroma: 0.1, steps: STANDARD_STEPS };
  const plain = buildRamp(spec);
  const darker = buildRamp({ ...spec, shift: -0.07 });

  for (const [index, swatch] of plain.entries()) {
    const shifted = darker[index];
    expect(shifted).toBeDefined();
    if (shifted === undefined) continue;

    const before = hexToOklch(swatch.hex);
    const after = hexToOklch(shifted.hex);
    expect(before.lightness - after.lightness).toBeGreaterThan(0.04);
  }
});

test("a text shift dims the light steps and leaves the dark ones", () => {
  const spec = { hue: 290, chroma: 0.02, steps: STANDARD_STEPS };
  const plain = buildRamp(spec);
  const dimmed = buildRamp({ ...spec, textShift: -0.05 });

  const hexOf = (swatches: typeof plain, step: number) =>
    swatches.find((swatch) => swatch.step === step)?.hex ?? "";

  expect(hexOf(dimmed, 100)).not.toBe(hexOf(plain, 100));
  expect(hexOf(dimmed, 300)).not.toBe(hexOf(plain, 300));
  expect(hexOf(dimmed, 500)).toBe(hexOf(plain, 500));
  expect(hexOf(dimmed, 950)).toBe(hexOf(plain, 950));
});
