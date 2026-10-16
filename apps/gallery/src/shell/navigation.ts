/**
 * Where the gallery is: a group, and an entry inside it. Left and right change the group, up and
 * down walk every entry of the group across its sections.
 */

import type { Entry, Group } from "./entries.ts";

export type Place = { readonly groupIndex: number; readonly entryIndex: number };

/** What a hot reload keeps. Names instead of indexes, so adding an entry does not move the user. */
export type Bookmark = { readonly groupTitle: string; readonly entryId: string | undefined };

export const listEntries = (group: Group): readonly Entry[] =>
  group.sections.flatMap((section) => section.entries);

const wrap = (index: number, step: number, length: number) =>
  length === 0 ? 0 : (((index + step) % length) + length) % length;

export const findPlace = (groups: readonly Group[], bookmark: Bookmark | undefined): Place => {
  const groupIndex = Math.max(
    0,
    groups.findIndex((group) => group.title === bookmark?.groupTitle),
  );

  const entries = groups[groupIndex] === undefined ? [] : listEntries(groups[groupIndex]);

  return {
    groupIndex,
    entryIndex: Math.max(
      0,
      entries.findIndex((entry) => entry.id === bookmark?.entryId),
    ),
  };
};

/** A new group starts at its first entry. */
export const moveGroup = (groups: readonly Group[], place: Place, step: number): Place => ({
  groupIndex: wrap(place.groupIndex, step, groups.length),
  entryIndex: 0,
});

export const moveEntry = (groups: readonly Group[], place: Place, step: number): Place => {
  const group = groups[place.groupIndex];
  const count = group === undefined ? 0 : listEntries(group).length;

  return { ...place, entryIndex: wrap(place.entryIndex, step, count) };
};
