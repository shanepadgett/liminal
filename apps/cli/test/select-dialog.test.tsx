import { expect, test } from "bun:test";

import { createTestRenderer } from "@opentui/core/testing";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";

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
