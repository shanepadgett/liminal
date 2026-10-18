import { expect, test } from "bun:test";

import type { Command } from "@liminal/sdk/tui";

import { paletteOptions } from "../src/tui/options.ts";

const command = (name: string, extra: Partial<Command> = {}): Command => ({
  name,
  title: name,
  run: () => {},
  ...extra,
});

test("only palette commands are options, with their keys and category", () => {
  const options = paletteOptions([
    { command: command("a.one", { palette: true, category: "A" }), keys: "ctrl+o" },
    { command: command("a.hidden"), keys: "" },
    { command: command("b.two", { palette: true }), keys: "" },
  ]);

  expect(options).toEqual([
    { title: "a.one", value: "a.one", category: "A", keys: "ctrl+o" },
    { title: "b.two", value: "b.two", category: "", keys: "" },
  ]);
});
