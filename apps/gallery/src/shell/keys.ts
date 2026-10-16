/**
 * The gallery's key map. Every key goes through `@opentui/keymap`: a named command per action, and
 * bindings that point at those names. A binding with a `desc` shows in the key hints; bindings that
 * share a `desc` share one hint, so the vim aliases and ctrl+c work without crowding them.
 */

import type { Binding, Command } from "@opentui/keymap";
import { useBindings } from "@opentui/keymap/solid";

export type ShellActions = {
  readonly moveGroup: (step: number) => void;
  readonly moveEntry: (step: number) => void;
  readonly nextState: () => void;
  readonly nextPalette: () => void;
  readonly nextSize: () => void;
  readonly scrollPage: (direction: number) => void;
  readonly quit: () => void;
};

const BINDINGS: readonly Binding[] = [
  { key: "left", cmd: "gallery.group.previous", desc: "group" },
  { key: "right", cmd: "gallery.group.next", desc: "group" },
  { key: "up", cmd: "gallery.entry.previous", desc: "choose" },
  { key: "down", cmd: "gallery.entry.next", desc: "choose" },
  { key: "pageup", cmd: "gallery.page.up", desc: "scroll" },
  { key: "pagedown", cmd: "gallery.page.down", desc: "scroll" },
  { key: "t", cmd: "gallery.palette.next", desc: "theme" },
  { key: "z", cmd: "gallery.size.next", desc: "size" },
  { key: "q", cmd: "gallery.quit", desc: "quit" },
  { key: "h", cmd: "gallery.group.previous" },
  { key: "l", cmd: "gallery.group.next" },
  { key: "k", cmd: "gallery.entry.previous" },
  { key: "j", cmd: "gallery.entry.next" },
  { key: "ctrl+c", cmd: "gallery.quit" },
];

const listCommands = (actions: ShellActions): readonly Command[] => [
  {
    name: "gallery.group.previous",
    run: () => {
      actions.moveGroup(-1);
    },
  },
  {
    name: "gallery.group.next",
    run: () => {
      actions.moveGroup(1);
    },
  },
  {
    name: "gallery.entry.previous",
    run: () => {
      actions.moveEntry(-1);
    },
  },
  {
    name: "gallery.entry.next",
    run: () => {
      actions.moveEntry(1);
    },
  },
  {
    name: "gallery.page.up",
    run: () => {
      actions.scrollPage(-1);
    },
  },
  {
    name: "gallery.page.down",
    run: () => {
      actions.scrollPage(1);
    },
  },
  {
    name: "gallery.state.next",
    run: () => {
      actions.nextState();
    },
  },
  {
    name: "gallery.palette.next",
    run: () => {
      actions.nextPalette();
    },
  },
  {
    name: "gallery.size.next",
    run: () => {
      actions.nextSize();
    },
  },
  { name: "gallery.quit", run: actions.quit },
];

/** Bound only while the entry has more than one state, so the hint never offers a dead key. */
const STATE_BINDINGS: readonly Binding[] = [{ key: "s", cmd: "gallery.state.next", desc: "state" }];

export const useShellKeys = (actions: ShellActions, hasStates: () => boolean) => {
  useBindings(() => ({
    commands: listCommands(actions),
    bindings: hasStates() ? [...BINDINGS, ...STATE_BINDINGS] : BINDINGS,
  }));
};
