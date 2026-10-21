/**
 * How to fit a long path into fewer columns: keep its start and its end, which tell the most, and
 * put `…` between them.
 */

export const ELLIPSIS = "…";

/** How many characters to keep from each end. */
export type Cut = { readonly head: number; readonly tail: number };

/** The cut for text of `length` characters in `columns`, or none when it already fits. */
export const middleCut = (length: number, columns: number): Cut | undefined => {
  if (length <= columns) {
    return undefined;
  }

  const kept = Math.max(columns - ELLIPSIS.length, 0);
  const head = Math.floor(kept / 2);

  return { head, tail: kept - head };
};
