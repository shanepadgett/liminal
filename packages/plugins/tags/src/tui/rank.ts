/**
 * Ranks tags for what follows a typed `@`: a tag's `fuzzysort` match times one plus its frecency,
 * so tags sent often rise. With nothing typed yet, frecency alone orders them.
 */
import fuzzysort from "fuzzysort";

import type { ListedTag } from "../contract.ts";

export interface Ranked {
  readonly row: ListedTag;
  /** Indexes of the matched letters in the tag. */
  readonly matches: readonly number[];
}

/** How many rows the menu holds. */
const MAX_ROWS = 50;

export const rank = (rows: readonly ListedTag[], query: string): readonly Ranked[] => {
  if (query === "") {
    return rows
      .toSorted((a, b) => b.frecency - a.frecency)
      .slice(0, MAX_ROWS)
      .map((row) => ({ row, matches: [] }));
  }

  return fuzzysort
    .go(query, rows, { key: "tag" })
    .map((result) => ({
      row: result.obj,
      matches: result.indexes,
      score: result.score * (1 + result.obj.frecency),
    }))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, MAX_ROWS)
    .map(({ row, matches }) => ({ row, matches }));
};
