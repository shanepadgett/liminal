/**
 * How much of each kind of entry a transcript style shows. A turn is `working` while the assistant
 * is still on it and `done` after. A style gives every kind a level for each phase, and names the
 * neighboring kinds it folds into one line in each phase.
 */

import type { EntryKind } from "./entries.ts";

export type Phase = "working" | "done";

/**
 * `full` draws the whole block; `line` draws one line that opens to the block; `live` draws one
 * line only while the entry is the turn's current action; `latest` draws one line for only the last
 * entry of its kind in the reply; `hidden` draws nothing.
 */
export type Level = "full" | "line" | "live" | "latest" | "hidden";

/** How a row is drawn once its level is settled: `latest` draws as a line, or not at all. */
export type DrawnLevel = Exclude<Level, "latest" | "hidden">;

/** What a group's line says: a fixed label such as `Explored`, or a tally of what its entries did. */
export type GroupHeading =
  | { readonly kind: "label"; readonly text: string }
  | { readonly kind: "tally" };

/**
 * Neighboring entries of these kinds fold into one line. Open, the group's entries fold again by
 * its `inner` rules, so a folded turn opens to its steps.
 */
export type GroupRule = {
  readonly kinds: readonly EntryKind[];
  readonly heading: GroupHeading;
  readonly inner: readonly GroupRule[];
};

export type Style = {
  readonly name: string;
  readonly levels: Readonly<Record<EntryKind, Readonly<Record<Phase, Level>>>>;
  readonly groups: Readonly<Record<Phase, readonly GroupRule[]>>;
  /** The style a finished turn's work log is drawn in, once its `worked` line is opened. */
  readonly log?: Style;
};
