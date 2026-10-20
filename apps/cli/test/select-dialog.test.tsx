import { expect, test } from "bun:test";

import { createTestRenderer } from "@opentui/core/testing";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/solid";
import { type JSX, render } from "@opentui/solid";
import { createSignal } from "solid-js";

import { ColorContext, PALETTES, resolveRoles, SelectDialog } from "@liminal/sdk/tui";

test("explicit empty categories and selected details remain visible without an enter action", async () => {
  let closed = false;

  const setup = await drawDialog(() => (
    <SelectDialog
      title="Manage skills"
      categories={["Empty folder", "Skills folder"]}
      options={[{ title: "review", value: "review", category: "Skills folder" }]}
      close={() => {
        closed = true;
      }}
      footer={(value) => <text>{value ? `Details for ${value}` : "No selected skill"}</text>}
    />
  ));

  try {
    const frame = setup.captureCharFrame();
    expect(frame).toContain("Empty folder");
    expect(frame).toContain("No options in this section.");
    expect(frame).toContain("Details for review");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(closed).toBe(false);
    await setup.mockInput.typeText("absent");
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("No selected skill");
    expect(setup.captureCharFrame()).not.toContain("Empty folder");
  } finally {
    setup.renderer.destroy();
  }
});

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

const drawDialog = async (draw: () => JSX.Element, width = 110) => {
  const setup = await createTestRenderer({ width, height: 25 });
  const keymap = createDefaultOpenTuiKeymap(setup.renderer);

  await render(
    () => (
      <KeymapProvider keymap={keymap}>
        <ColorContext.Provider value={resolveRoles(PALETTES[0])}>{draw()}</ColorContext.Provider>
      </KeymapProvider>
    ),
    setup.renderer,
  );

  await setup.renderOnce();
  await setup.renderOnce();

  return setup;
};

for (const width of [48, 110]) {
  test(`descriptions share the title row, ellipsize and retain trailing metadata at ${width} columns`, async () => {
    const description = "Review changes\nfor bugs, missing tests and regressions. ".repeat(8);

    const setup = await drawDialog(
      () => (
        <SelectDialog
          title="Manage skills"
          width={90}
          options={[{ title: "review", value: "review", description, trailing: "Symlink" }]}
          close={() => {}}
        />
      ),
      width,
    );

    try {
      const frame = setup.captureCharFrame();
      const row = frame.split("\n").find((line) => line.includes("review"));
      expect(row).toContain("Review changes");
      expect(row).toContain("…");
      expect(row).toContain("Symlink");
      expect(frame).not.toContain(description);
      expect(frame.match(/Review changes/g)).toHaveLength(1);
    } finally {
      setup.renderer.destroy();
    }
  });
}

test("a dialog action works with an empty filtered list and preserves the filter", async () => {
  const [values, setValues] = createSignal(["one"]);
  let changed = false;

  const setup = await drawDialog(() => (
    <SelectDialog
      title="Sessions"
      options={values().map((value) => ({ title: value, value }))}
      close={() => {}}
      onSelect={() => {}}
      dialogActions={[
        {
          key: "tab",
          label: "archived",
          run: () => {
            changed = true;
            setValues(["two"]);
          },
        },
      ]}
    />
  ));

  await setup.mockInput.typeText("two");
  await setup.renderOnce();
  expect(setup.captureCharFrame()).toContain("No matching options");
  setup.mockInput.pressTab();
  await setup.renderOnce();
  expect(changed).toBe(true);
  expect(setup.captureCharFrame()).not.toContain("No matching options");
  setValues(["one"]);
  await setup.renderOnce();
  expect(setup.captureCharFrame()).toContain("No matching options");
  setup.renderer.destroy();
});

test("async removal selects the next row, then the previous row at the end", async () => {
  const [values, setValues] = createSignal(["one", "two", "three"]);
  const highlighted: string[] = [];
  const chosen: string[] = [];

  const setup = await drawDialog(() => (
    <SelectDialog
      title="Sessions"
      current="two"
      options={values().map((value) => ({ title: value, value }))}
      close={() => {}}
      onSelect={(value) => chosen.push(value)}
      onHighlight={(value) => highlighted.push(value)}
    />
  ));

  setValues(["one", "three"]);
  await setup.renderOnce();
  expect(highlighted.at(-1)).toBe("three");
  setValues(["one"]);
  await setup.renderOnce();
  setup.mockInput.pressEnter();
  await setup.renderOnce();
  expect(chosen).toEqual(["one"]);
  setup.renderer.destroy();
});

for (const current of [undefined, "two"] as const) {
  test(`entering a screen resets to ${current ?? "the first row"}, even with unchanged options`, async () => {
    const [screen, setScreen] = createSignal("active");
    const options = ["one", "two", "three"].map((value) => ({ title: value, value }));
    const highlighted: string[] = [];
    const chosen: string[] = [];

    const setup = await drawDialog(() => (
      <SelectDialog
        title="Screens"
        screen={screen()}
        current={current}
        options={options}
        close={() => {}}
        onSelect={(value) => chosen.push(value)}
        onHighlight={(value) => highlighted.push(value)}
      />
    ));

    expect(highlighted.at(-1)).toBe(current ?? "one");

    const enterScreen = async (next: string) => {
      setup.mockInput.pressArrow("down");
      await setup.renderOnce();
      expect(highlighted.at(-1)).toBe(current === undefined ? "two" : "three");
      setScreen(next);
      await setup.renderOnce();
      expect(highlighted.at(-1)).toBe(current ?? "one");
      setup.mockInput.pressEnter();
      await setup.renderOnce();
    };

    await enterScreen("archived");
    await enterScreen("active");

    expect(chosen).toEqual([current ?? "one", current ?? "one"]);
    setup.renderer.destroy();
  });
}

test("refreshing a screen preserves the highlight by value instead of reapplying current", async () => {
  const [values, setValues] = createSignal(["one", "two", "three"]);
  const chosen: string[] = [];

  const setup = await drawDialog(() => (
    <SelectDialog
      title="Models"
      screen="models"
      current="one"
      options={values().map((value) => ({ title: value, value }))}
      close={() => {}}
      onSelect={(value) => chosen.push(value)}
    />
  ));

  setup.mockInput.pressArrow("down");
  await setup.renderOnce();
  setValues(["three", "one", "two"]);
  await setup.renderOnce();
  setup.mockInput.pressEnter();
  await setup.renderOnce();
  expect(chosen).toEqual(["two"]);
  setup.renderer.destroy();
});

test("screen entry retains the filter and falls back when current does not match", async () => {
  const [screen, setScreen] = createSignal("active");
  const [values, setValues] = createSignal(["keep one", "keep two", "other"]);
  const chosen: string[] = [];

  const setup = await drawDialog(() => (
    <SelectDialog
      title="Screens"
      screen={screen()}
      current="other"
      options={values().map((value) => ({ title: value, value }))}
      close={() => {}}
      onSelect={(value) => chosen.push(value)}
    />
  ));

  await setup.mockInput.typeText("keep");
  await setup.renderOnce();
  setup.mockInput.pressArrow("down");
  await setup.renderOnce();
  setScreen("archived");
  await setup.renderOnce();
  setup.mockInput.pressEnter();
  await setup.renderOnce();
  expect(chosen).toEqual(["keep one"]);
  expect(setup.captureCharFrame()).not.toContain("other");
  setValues(["other"]);
  await setup.renderOnce();
  expect(setup.captureCharFrame()).toContain("No matching options");
  setup.renderer.destroy();
});

for (const width of [38, 110]) {
  test(`a wide dialog at ${width} columns keeps dates and truncates grapheme titles at the end`, async () => {
    const setup = await drawDialog(
      () => (
        <SelectDialog
          title="Sessions"
          width={90}
          options={[{ title: "界é".repeat(50), value: "one", trailing: "2 hours ago" }]}
          close={() => {}}
          onSelect={() => {}}
        />
      ),
      width,
    );

    const frame = setup.captureCharFrame();
    const row = frame.split("\n").find((line) => line.includes("2 hours ago"));
    expect(row).toContain("界é");
    expect(row).toContain("…");
    expect(row?.trimEnd()).toEndWith("2 hours ago");
    expect(row).not.toContain("...");
    setup.renderer.destroy();
  });
}
