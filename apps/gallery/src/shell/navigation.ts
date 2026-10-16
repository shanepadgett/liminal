/**
 * Where the gallery is: a group, an entry inside it, and the state that entry shows. Left and right
 * change the group, up and down walk every entry of the group across its sections, and `s` cycles
 * the entry's states. Moving to another group or entry starts at its first state. The palette,
 * cycled with `t`, and the frame size, cycled with `z`, stay the same wherever the user goes.
 */

import type { Palette } from "../tokens/palettes.ts";
import type { Bookmark } from "./bookmark.ts";
import type { Entry, Group } from "./entries.ts";
import type { FrameSize } from "./sizes.ts";

export type Place = {
  readonly groupIndex: number;
  readonly entryIndex: number;
  readonly stateIndex: number;
};

export const listEntries = (group: Group): readonly Entry[] =>
  group.sections.flatMap((section) => section.entries);

const wrap = (index: number, step: number, length: number) =>
  length === 0 ? 0 : (((index + step) % length) + length) % length;

/** The index of the first item that matches, or 0 when none does. */
const indexOr0 = <T>(items: readonly T[], matches: (item: T) => boolean) =>
  Math.max(0, items.findIndex(matches));

export const findPlace = (groups: readonly Group[], bookmark: Bookmark | undefined): Place => {
  const groupIndex = indexOr0(groups, (group) => group.title === bookmark?.groupTitle);
  const group = groups[groupIndex];
  const entries = group === undefined ? [] : listEntries(group);
  const entryIndex = indexOr0(entries, (entry) => entry.id === bookmark?.entryId);
  const states = entries[entryIndex]?.states ?? [];

  return {
    groupIndex,
    entryIndex,
    stateIndex: indexOr0(states, (state) => state.name === bookmark?.stateName),
  };
};

export const findPaletteIndex = (
  palettes: readonly Palette[],
  bookmark: Bookmark | undefined,
): number => indexOr0(palettes, (palette) => palette.id === bookmark?.paletteId);

export const findSizeIndex = (
  sizes: readonly FrameSize[],
  bookmark: Bookmark | undefined,
): number => indexOr0(sizes, (size) => size.name === bookmark?.sizeName);

export const moveGroup = (groups: readonly Group[], place: Place, step: number): Place => ({
  groupIndex: wrap(place.groupIndex, step, groups.length),
  entryIndex: 0,
  stateIndex: 0,
});

export const moveEntry = (groups: readonly Group[], place: Place, step: number): Place => {
  const group = groups[place.groupIndex];
  const count = group === undefined ? 0 : listEntries(group).length;

  return { ...place, entryIndex: wrap(place.entryIndex, step, count), stateIndex: 0 };
};

export const moveState = (entry: Entry | undefined, place: Place, step: number): Place => ({
  ...place,
  stateIndex: wrap(place.stateIndex, step, entry?.states.length ?? 0),
});
