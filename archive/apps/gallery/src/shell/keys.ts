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
  readonly moveState: (step: number) => void;
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

/** A command that moves through a list by `step`. */
const stepCommand = (name: string, move: (step: number) => void, step: number): Command => ({
  name,
  run: () => {
    move(step);
  },
});

const listCommands = (actions: ShellActions): readonly Command[] => [
  stepCommand("gallery.group.previous", actions.moveGroup, -1),
  stepCommand("gallery.group.next", actions.moveGroup, 1),
  stepCommand("gallery.entry.previous", actions.moveEntry, -1),
  stepCommand("gallery.entry.next", actions.moveEntry, 1),
  stepCommand("gallery.page.up", actions.scrollPage, -1),
  stepCommand("gallery.page.down", actions.scrollPage, 1),
  stepCommand("gallery.state.previous", actions.moveState, -1),
  stepCommand("gallery.state.next", actions.moveState, 1),
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
const STATE_BINDINGS: readonly Binding[] = [
  { key: "s", cmd: "gallery.state.next", desc: "state" },
  { key: "shift+s", cmd: "gallery.state.previous", desc: "state" },
];

export const useShellKeys = (actions: ShellActions, hasStates: () => boolean) => {
  useBindings(() => ({
    commands: listCommands(actions),
    bindings: hasStates() ? [...BINDINGS, ...STATE_BINDINGS] : BINDINGS,
  }));
};
