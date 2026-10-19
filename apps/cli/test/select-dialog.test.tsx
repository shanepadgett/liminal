import { expect, test } from "bun:test";

import { createTestRenderer } from "@opentui/core/testing";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { createSignal } from "solid-js";

import { ColorContext, PALETTES, resolveRoles, SelectDialog } from "@liminal/sdk/tui";

test("the current option is scrolled into view when the dialog opens", async () => {
  const setup = await createTestRenderer({ width: 80, height: 30 });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  const color = resolveRoles(PALETTES[0]);

  const options = [
    ...Array.from({ length: 30 }, (_, i) => ({
      title: `Claude ${i}`,
      value: `a/${i}`,
      category: "Claude",
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      title: `GPT ${i}`,
      value: `c/${i}`,
      category: "Codex",
    })),
  ];

  await render(
    () => (
      <KeymapProvider keymap={keymap}>
        <ColorContext.Provider value={color}>
          <SelectDialog
            title="Models"
            options={options}
            current="c/2"
            close={() => {}}
            onSelect={() => {}}
          />
        </ColorContext.Provider>
      </KeymapProvider>
    ),
    setup.renderer,
  );

  await setup.renderOnce();
  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  setup.renderer.destroy();
  expect(frame).toContain("GPT 2");
});

test("an action that keeps the dialog open runs at once and the highlight follows the option", async () => {
  const setup = await createTestRenderer({ width: 80, height: 20 });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);
  const color = resolveRoles(PALETTES[0]);
  const [pinned, setPinned] = createSignal<ReadonlySet<string>>(new Set());
  let closed = false;

  const options = () =>
    ["one", "two", "three"]
      .map((value) => ({ title: value, value, category: pinned().has(value) ? "Pinned" : "Rest" }))
      .toSorted(
        (left, right) => Number(right.category === "Pinned") - Number(left.category === "Pinned"),
      );

  const acted: string[] = [];

  await render(
    () => (
      <KeymapProvider keymap={keymap}>
        <ColorContext.Provider value={color}>
          <SelectDialog
            title="Models"
            options={options()}
            close={() => {
              closed = true;
            }}
            onSelect={(value) => {
              acted.push(`select:${value}`);
            }}
            actions={[
              {
                key: "ctrl+f",
                label: "pin",
                keepsOpen: true,
                run: (value) => {
                  acted.push(`pin:${value}`);
                  setPinned(new Set([...pinned(), value]));
                },
              },
            ]}
          />
        </ColorContext.Provider>
      </KeymapProvider>
    ),
    setup.renderer,
  );

  await setup.renderOnce();
  setup.mockInput.pressArrow("down");
  await setup.renderOnce();
  setup.mockInput.pressKey("f", { ctrl: true });
  await setup.renderOnce();
  setup.mockInput.pressEnter();
  await setup.renderOnce();
  setup.renderer.destroy();

  expect(acted).toEqual(["pin:two", "select:two"]);
  expect(closed).toBe(true);
});
