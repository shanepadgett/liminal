/**
 * The slot tree as values: registering needs a declared slot, a cell holds one entry per priority,
 * removing an owner collapses its child slots, and each kind picks what it shows.
 */

import { describe, expect, test } from "bun:test";

import { Result } from "effect";

import { type AnySlot, RootSlot, Slot, SlotConflict, SlotUndeclared } from "@liminal/sdk";

import {
  chained,
  type Entry,
  listed,
  makeTree,
  register,
  remove,
  type SlotTree,
  winner,
} from "../src/tree.ts";

const header = Slot.list<{}>("chat/header", { scope: "root" });
const tool = Slot.keyed<{}, string>("chat/tool", { scope: "session" });
const composer = Slot.chain<{}, true>("chat/composer", { scope: "session" });

let lastId = 0;

const entry = (
  plugin: string,
  slot: AnySlot,
  options: Partial<Pick<Entry<string>, "cell" | "priority" | "order" | "meta" | "declares">> = {},
): Entry<string> => ({
  id: ++lastId,
  plugin,
  slot: slot.name,
  cell: "",
  priority: 0,
  order: 0,
  meta: undefined,
  select: undefined,
  component: plugin,
  declares: [],
  ...options,
});

const added = (tree: SlotTree<string>, ...entries: ReadonlyArray<Entry<string>>) => {
  let current = tree;
  for (const next of entries) current = Result.getOrThrow(register(current, next));

  return current;
};

const chat = entry("chat", RootSlot, { declares: [header, tool, composer] });
const base = added(makeTree([RootSlot]), chat);

describe("register", () => {
  test("fails into an undeclared slot", () => {
    const result = register(makeTree<string>([RootSlot]), entry("tools", tool, { cell: "read" }));

    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(SlotUndeclared);
  });

  test("fails on the same cell and priority, naming the holder", () => {
    const tree = added(base, entry("tools-file", tool, { cell: "read" }));
    const result = register(tree, entry("other", tool, { cell: "read" }));

    expect(Result.isFailure(result) && result.failure).toEqual(
      new SlotConflict({ slot: "chat/tool", cell: "read", priority: 0, holder: "tools-file" }),
    );
  });

  test("fails when a child slot is already declared", () => {
    const result = register(base, entry("other", tool, { cell: "x", declares: [header] }));

    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(SlotConflict);
  });

  test("a lower priority shadows the cell", () => {
    const tree = added(
      base,
      entry("tools-file", tool, { cell: "read", meta: "file" }),
      entry("override", tool, { cell: "read", priority: -1, meta: "override" }),
    );

    expect(winner(tree, "chat/tool", "read")?.meta).toBe("override");
  });
});

describe("remove", () => {
  test("collapses child slots and names the dropped plugins", () => {
    const nested = Slot.list<{}>("tools/rows", { scope: "root" });
    const owner = entry("tools-file", tool, { cell: "read", declares: [nested] });
    const tree = added(base, owner, entry("rows", nested), entry("inbox", composer));
    const removed = remove(tree, chat.id);

    expect([...removed.tree.declared.keys()]).toEqual(["root"]);
    expect(removed.tree.entries).toEqual([]);

    expect(removed.dropped).toEqual(
      new Map([
        ["tools-file", new Set(["chat/tool"])],
        ["rows", new Set(["tools/rows"])],
        ["inbox", new Set(["chat/composer"])],
      ]),
    );
  });

  test("leaves sibling slots alone", () => {
    const tree = added(base, entry("a", header, { cell: "a" }), entry("b", header, { cell: "b" }));
    const first = tree.entries.find((held) => held.plugin === "a");
    const removed = remove(tree, first?.id ?? 0);

    expect(removed.dropped.size).toBe(0);
    expect(listed(removed.tree, "chat/header").map((held) => held.plugin)).toEqual(["b"]);
  });
});

describe("kinds", () => {
  test("a list shows each cell's winner by order", () => {
    const tree = added(
      base,
      entry("late", header, { cell: "late", order: 2 }),
      entry("early", header, { cell: "early", order: 1 }),
      entry("early-override", header, { cell: "early", order: 1, priority: -1 }),
    );

    expect(listed(tree, "chat/header").map((held) => held.plugin)).toEqual([
      "early-override",
      "late",
    ]);
  });

  test("a chain is tried lowest priority first", () => {
    const tree = added(
      base,
      entry("inbox", composer),
      entry("questions", composer, { priority: -10 }),
    );

    expect(chained(tree, "chat/composer").map((held) => held.plugin)).toEqual([
      "questions",
      "inbox",
    ]);
  });
});
