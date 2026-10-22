/**
 * Where the user is: a group, an entry in it, the entry's state, a palette and a frame size. Left
 * and right change the group, up and down walk the group's entries, `s` the states, `t` the
 * palettes and `z` the sizes. A new group or entry opens at its first state.
 */

import type { Entry, Group, State } from "../entries.ts";
import { type Palette, PALETTES } from "../theme/palettes.ts";
import type { Bookmark } from "./bookmark.ts";

/** A terminal size to judge a view at; `fit` takes all the room there is. */
export interface Size {
  readonly name: string;
  readonly columns: number;
  readonly rows: number;
}

const fixed = (columns: number, rows: number): Size => ({
  name: `${columns}×${rows}`,
  columns,
  rows,
});

export const SIZES: readonly [Size, ...Size[]] = [
  { name: "fit", columns: Number.POSITIVE_INFINITY, rows: Number.POSITIVE_INFINITY },
  fixed(120, 30),
  fixed(100, 30),
  fixed(80, 24),
  fixed(60, 20),
];

export interface Place {
  readonly group: number;
  readonly entry: number;
  readonly state: number;
  readonly palette: number;
  readonly size: number;
}

export type Move = keyof Place;

/** What a place points at. The entry and state are missing only in a group with no entries. */
export interface Shown {
  readonly group: Group;
  readonly entry: Entry | undefined;
  readonly state: State | undefined;
  readonly palette: Palette;
  readonly size: Size;
}

const entriesOf = (group: Group): readonly Entry[] =>
  group.sections.flatMap((section) => section.entries);

const wrap = (index: number, step: number, length: number) =>
  length === 0 ? 0 : (((index + step) % length) + length) % length;

/** The index of the first match, or 0 when nothing matches. */
const indexOf = <T>(items: readonly T[], matches: (item: T) => boolean) =>
  Math.max(0, items.findIndex(matches));

export const shownAt = (groups: readonly [Group, ...Group[]], place: Place): Shown => {
  const group = groups[place.group] ?? groups[0];
  const entry = entriesOf(group)[place.entry];

  return {
    group,
    entry,
    state: entry?.states[place.state],
    palette: PALETTES[place.palette] ?? PALETTES[0],
    size: SIZES[place.size] ?? SIZES[0],
  };
};

/** How many choices each part of a place has, to wrap a move around. */
const counts = (groups: readonly [Group, ...Group[]], place: Place): Place => {
  const shown = shownAt(groups, place);

  return {
    group: groups.length,
    entry: entriesOf(shown.group).length,
    state: shown.entry?.states.length ?? 0,
    palette: PALETTES.length,
    size: SIZES.length,
  };
};

/** Moving the group or entry starts the next one at its top. */
export const move = (
  groups: readonly [Group, ...Group[]],
  place: Place,
  part: Move,
  step: number,
): Place => {
  const moved: Place = { ...place, [part]: wrap(place[part], step, counts(groups, place)[part]) };
  if (part === "group") return { ...moved, entry: 0, state: 0 };
  if (part === "entry") return { ...moved, state: 0 };

  return moved;
};

export const placeOf = (
  groups: readonly [Group, ...Group[]],
  bookmark: Bookmark | undefined,
): Place => {
  const group = indexOf(groups, (each) => each.title === bookmark?.group);
  const entries = entriesOf(groups[group] ?? groups[0]);
  const entry = indexOf(entries, (each) => each.id === bookmark?.entry);

  return {
    group,
    entry,
    state: indexOf(entries[entry]?.states ?? [], (each) => each.name === bookmark?.state),
    palette: indexOf(PALETTES, (each) => each.id === bookmark?.palette),
    size: indexOf(SIZES, (each) => each.name === bookmark?.size),
  };
};

export const bookmarkOf = (shown: Shown): Bookmark => ({
  group: shown.group.title,
  entry: shown.entry?.id,
  state: shown.state?.name,
  palette: shown.palette.id,
  size: shown.size.name,
});
