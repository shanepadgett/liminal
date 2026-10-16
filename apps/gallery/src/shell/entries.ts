/**
 * What the gallery lists: groups from tokens up to screens, each split into sections of entries to
 * review. An entry shows in one or more states, such as idle and working, cycled with `s`, and
 * draws itself in the palette chosen with `t`.
 */

import type { JSX } from "@opentui/solid";

import type { Palette } from "../tokens/palettes.ts";

/**
 * How a state sits in the preview frame. `page` is a document read from the top and scrolled;
 * `width` spans the frame and is centered up and down; `content` keeps its own size and is centered
 * both ways; `screen` fills the whole frame.
 */
export type Fill = "page" | "width" | "content" | "screen";

export type EntryState = {
  readonly name: string;
  readonly fill: Fill;
  readonly view: (palette: Palette) => JSX.Element;
};

export type Entry = {
  readonly id: string;
  readonly title: string;
  readonly states: readonly [EntryState, ...EntryState[]];
};

export type Section = { readonly title: string; readonly entries: readonly Entry[] };

export type Group = { readonly title: string; readonly sections: readonly Section[] };

/** The gallery always has a group to show, even when that group is still empty. */
export type Groups = readonly [Group, ...Group[]];
