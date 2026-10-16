/**
 * How much of each kind of entry a transcript style shows. A turn is `working` while the assistant
 * is still on it and `done` after. A style gives every kind a level for each phase, and names the
 * neighboring kinds it folds into one line.
 */

import type { EntryKind, ToolKind } from "./entries.ts";

export type Phase = "working" | "done";

/**
 * `full` draws the whole block; `line` draws one line that opens to the block; `live` draws one
 * line only while the entry is the turn's current action; `hidden` draws nothing.
 */
export type Level = "full" | "line" | "live" | "hidden";

export type DrawnLevel = Exclude<Level, "hidden">;

/** Neighboring tool calls of these kinds fold into one line under the label. */
export type GroupRule = { readonly kinds: readonly ToolKind[]; readonly label: string };

export type Style = {
  readonly name: string;
  readonly levels: Readonly<Record<EntryKind, Readonly<Record<Phase, Level>>>>;
  readonly groups: readonly GroupRule[];
};
