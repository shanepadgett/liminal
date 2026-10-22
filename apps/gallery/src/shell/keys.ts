/**
 * The gallery's keys, all through `@opentui/keymap`: a named command per action and bindings that
 * point at the names. A binding with a `desc` shows in the key hints; bindings that share a `desc`
 * share a hint, so the vim aliases and ctrl+c do not crowd them.
 */

import type { Binding, Command } from "@opentui/keymap";
import { useBindings } from "@opentui/keymap/solid";

import type { Move } from "./place.ts";

export interface ShellActions {
  readonly move: (part: Move, step: number) => void;
  readonly scroll: (direction: number) => void;
  readonly quit: () => void;
}

const BINDINGS: readonly Binding[] = [
  { key: "left", cmd: "gallery.group.previous", desc: "group" },
  { key: "right", cmd: "gallery.group.next", desc: "group" },
  { key: "up", cmd: "gallery.entry.previous", desc: "entry" },
  { key: "down", cmd: "gallery.entry.next", desc: "entry" },
  { key: "pageup", cmd: "gallery.page.up", desc: "scroll" },
  { key: "pagedown", cmd: "gallery.page.down", desc: "scroll" },
  { key: "t", cmd: "gallery.palette.next", desc: "palette" },
  { key: "z", cmd: "gallery.size.next", desc: "size" },
  { key: "q", cmd: "gallery.quit", desc: "quit" },
  { key: "h", cmd: "gallery.group.previous" },
  { key: "l", cmd: "gallery.group.next" },
  { key: "k", cmd: "gallery.entry.previous" },
  { key: "j", cmd: "gallery.entry.next" },
  { key: "ctrl+c", cmd: "gallery.quit" },
];

/** Bound only while the entry has more than one state, so the hints never offer a dead key. */
const STATE_BINDINGS: readonly Binding[] = [
  { key: "s", cmd: "gallery.state.next", desc: "state" },
  { key: "shift+s", cmd: "gallery.state.previous", desc: "state" },
];

const moveCommand = (name: string, run: () => void): Command => ({ name, run });

const commands = (actions: ShellActions): readonly Command[] => [
  moveCommand("gallery.group.previous", () => {
    actions.move("group", -1);
  }),
  moveCommand("gallery.group.next", () => {
    actions.move("group", 1);
  }),
  moveCommand("gallery.entry.previous", () => {
    actions.move("entry", -1);
  }),
  moveCommand("gallery.entry.next", () => {
    actions.move("entry", 1);
  }),
  moveCommand("gallery.state.previous", () => {
    actions.move("state", -1);
  }),
  moveCommand("gallery.state.next", () => {
    actions.move("state", 1);
  }),
  moveCommand("gallery.palette.next", () => {
    actions.move("palette", 1);
  }),
  moveCommand("gallery.size.next", () => {
    actions.move("size", 1);
  }),
  moveCommand("gallery.page.up", () => {
    actions.scroll(-1);
  }),
  moveCommand("gallery.page.down", () => {
    actions.scroll(1);
  }),
  moveCommand("gallery.quit", actions.quit),
];

export const useShellKeys = (actions: ShellActions, hasStates: () => boolean): void => {
  useBindings(() => ({
    commands: commands(actions),
    bindings: hasStates() ? [...BINDINGS, ...STATE_BINDINGS] : BINDINGS,
  }));
};
