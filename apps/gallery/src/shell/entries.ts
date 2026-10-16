/**
 * What the gallery lists: groups from tokens up to screens, each split into sections of entries to
 * review.
 */

import type { JSX } from "@opentui/solid";

export type Entry = {
  readonly id: string;
  readonly title: string;
  readonly view: () => JSX.Element;
};

export type Section = { readonly title: string; readonly entries: readonly Entry[] };

export type Group = { readonly title: string; readonly sections: readonly Section[] };

/** The gallery always has a group to show, even when that group is still empty. */
export type Groups = readonly [Group, ...Group[]];
