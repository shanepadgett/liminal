/** Slash command relevance, aliases and the character indexes shown in the menu. */

import { expect, test } from "bun:test";

import type { ListedCommand } from "@liminal/sdk/tui";

import { commandMatches } from "../src/tui/CommandMenu.tsx";

const command = (name: string, aliases: ReadonlyArray<string> = []): ListedCommand => ({
  command: { name, title: name, slash: { name, aliases }, run: () => {} },
  keys: "",
});

const names = (listed: ReadonlyArray<ListedCommand>, typed: string) =>
  commandMatches(listed, typed).map((match) => match.name);

test("an exact command ranks above interview-me regardless of registry order", () => {
  const listed = [command("interview-me"), command("new-session"), command("new")];
  expect(names(listed, "new")).toEqual(["/new", "/new-session", "/interview-me"]);
  expect(names(listed, "NEW")[0]).toBe("/new");
});

test("an exact alias ranks first and appears only once", () => {
  const listed = [command("interview-me"), command("fresh", ["new", "new-session"])];
  expect(names(listed, "new")).toEqual(["/fresh", "/interview-me"]);
  expect([...(commandMatches(listed, "new")[0]?.matches ?? [])]).toEqual([]);
});

test("the best alias contributes to fuzzy relevance", () => {
  expect(names([command("interview-me"), command("fresh", ["new-session"])], "new")).toEqual([
    "/fresh",
    "/interview-me",
  ]);
});

test("name matches highlight the displayed slash and matched characters", () => {
  const [match] = commandMatches([command("new")], "nw");
  expect(match?.name).toBe("/new");
  expect([...(match?.matches ?? [])]).toEqual([0, 1, 3]);
});

test("an empty query preserves registry order and highlights only the slash", () => {
  const listed = [command("interview-me"), command("new")];
  expect(names(listed, "")).toEqual(["/interview-me", "/new"]);
  expect(commandMatches(listed, "").map((match) => Array.from(match.matches))).toEqual([[0], [0]]);
});

test("equal scores preserve registry order", () => {
  expect(names([command("second", ["new"]), command("first", ["new"])], "new")).toEqual([
    "/second",
    "/first",
  ]);
});

test("commands without slash names and unmatched commands are excluded", () => {
  const listed = [
    command("new"),
    { command: { name: "hidden", title: "Hidden", run: () => {} }, keys: "" },
  ];

  expect(names(listed, "hidden")).toEqual([]);
  expect(names(listed, "zzz")).toEqual([]);
});

test("fuzzy results are not limited to the ten visible menu rows", () => {
  const listed = Array.from({ length: 15 }, (_, index) => command(`new-${index}`));
  expect(commandMatches(listed, "new")).toHaveLength(15);
});
