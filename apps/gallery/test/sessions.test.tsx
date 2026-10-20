/** Session dialog samples preserve titles and right-aligned dates at wide and narrow widths. */

import { expect, test } from "bun:test";

import { type JSX, testRender } from "@opentui/solid";

import { PALETTES, resolveRoles } from "@liminal/sdk/tui";

import { SessionPicker } from "../src/chat/SessionPicker.tsx";

const color = resolveRoles(PALETTES[0]);

const frameOf = async (draw: () => JSX.Element, width = 110) => {
  const setup = await testRender(draw, { width, height: 25 });
  await setup.renderOnce();
  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  setup.renderer.destroy();

  return frame;
};

test("active sessions use a 90-column dialog with trailing dates and archive hints", async () => {
  const frame = await frameOf(() => <SessionPicker color={color} view="active" selected="s4" />);

  const lines = frame.split("\n");
  const first = lines.find((line) => line.includes("Explain how the plugin host boots"));
  const older = lines.find((line) => line.includes("3 days ago"));

  expect(frame).toContain("Sessions · Active");
  expect(first?.indexOf("Explain")).toBe(12);
  expect(first?.trimEnd()).toEndWith("2 hours ago");
  expect(older?.trimEnd().length).toBe(first?.trimEnd().length);
  expect(frame).toContain("Fix the test so it checks that the model calls start concurrently");
  expect(frame).toContain("…");
  expect(frame).toContain("ctrl+a");
  expect(frame).toContain("archive");
  expect(frame).toContain("tab");
});

test("archived sessions include recent and calendar dates with restore hints", async () => {
  const frame = await frameOf(() => <SessionPicker color={color} view="archived" selected="a1" />);

  expect(frame).toContain("Sessions · Archived");
  expect(frame).toContain("2 hours ago");
  expect(frame).toContain("Oct 17");
  expect(frame).toContain("Dec 12, 2025");
  expect(frame).toContain("restore");
  expect(frame).toContain("active");
});

for (const width of [38, 60]) {
  test(`sessions fit a ${width}-column terminal and retain the activity date`, async () => {
    const frame = await frameOf(
      () => <SessionPicker color={color} view="active" selected="s1" />,
      width,
    );

    const line = frame.split("\n").find((row) => row.includes("6 days ago"));

    expect(line).toBeDefined();
    expect(line?.trimEnd()).toEndWith("6 days ago");
    expect(line?.length).toBe(width);
    expect(frame).toContain("…");
  });
}

for (const view of ["active", "archived"] as const) {
  test(`empty ${view} sessions retain the view and action hints`, async () => {
    const frame = await frameOf(() => (
      <SessionPicker color={color} view={view} selected="" sessions={[]} />
    ));

    expect(frame).toContain(`No ${view} sessions`);
    expect(frame).toContain("tab");
    expect(frame).toContain(view === "active" ? "archive" : "restore");
  });
}

test("wide session titles truncate without losing the trailing date", async () => {
  const frame = await frameOf(() => (
    <SessionPicker
      color={color}
      view="active"
      selected="wide"
      sessions={[{ id: "wide", title: "界".repeat(70), written: "just now" }]}
    />
  ));

  expect(frame).toContain("界");
  expect(frame).toContain("…");
  expect(frame).toContain("just now");
  expect(frame).not.toContain("�");
});
