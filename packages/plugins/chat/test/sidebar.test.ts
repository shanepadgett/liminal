/**
 * The sidebar's state: docked from 122 columns, the docked choice kept, the drawer closed on
 * resize.
 */

import { expect, test } from "bun:test";

import { makeSidebar, modeOf, type SidebarChoice } from "../src/tui/Sidebar.tsx";

const keptChoice = (initial: SidebarChoice) => {
  let choice = initial;

  return {
    get: () => choice,
    set: (next: SidebarChoice) => {
      choice = next;
    },
  };
};

test("the sidebar docks from 122 columns", () => {
  expect(modeOf(121)).toBe("drawer");
  expect(modeOf(122)).toBe("docked");
});

test("toggling a docked sidebar keeps the choice", () => {
  const kept = keptChoice("open");
  const sidebar = makeSidebar(kept);
  sidebar.setColumns(160);

  expect(sidebar.isOpen()).toBe(true);
  sidebar.toggle();
  expect(sidebar.isOpen()).toBe(false);
  expect(kept.get()).toBe("closed");
});

test("a drawer starts closed and closes when the terminal widens", () => {
  const kept = keptChoice("closed");
  const sidebar = makeSidebar(kept);
  sidebar.setColumns(100);

  expect(sidebar.isOpen()).toBe(false);
  sidebar.toggle();
  expect(sidebar.isOpen()).toBe(true);
  expect(kept.get()).toBe("closed");

  sidebar.setColumns(160);
  sidebar.setColumns(100);
  expect(sidebar.isOpen()).toBe(false);
});
