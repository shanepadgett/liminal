/**
 * Restoring files at a checkpoint: which files to read back, in what order, and how much of each,
 * within a share of the budget.
 */

import { Effect, Option } from "effect";

import type { WorkspaceFiles } from "@liminal/files/contract";
import { lineWindow } from "@liminal/tools-read/contract";

import type { CheckpointData, LineRange, MemoryFile, RestoredFile } from "../contract.ts";
import { textTokens } from "./budget.ts";
import { mergeLists, mergeRanges } from "./files.ts";
import type { Memory, Note } from "./store.ts";

/** The share of the budget restored files may take. */
export const RESTORE_SHARE = 0.15;

/** Files shorter than this many lines are read whole. */
const WHOLE_UNDER = 300;

/** Lines read on each side of a range. */
const PADDING = 20;

/** A file to read back; no ranges means the whole file. */
export interface Wanted {
  readonly path: string;
  readonly ranges: ReadonlyArray<LineRange>;
}

/** The relevant files of the memories a checkpoint uses: edited first, then newest first. */
export const rememberedFiles = (
  stored: { readonly notes: ReadonlyArray<Note>; readonly memories: ReadonlyArray<Memory> },
  used: Pick<CheckpointData, "longTerm" | "shortTerm">,
): ReadonlyArray<MemoryFile> => {
  const memory = stored.memories.find((each) => each.number === used.longTerm);
  const notes = stored.notes.filter((note) => used.shortTerm.includes(note.number));

  return mergeLists([memory?.files ?? [], ...notes.map((note) => note.files)])
    .filter((file) => file.relevant)
    .toSorted((a, b) => Number(b.edited) - Number(a.edited) || b.seq - a.seq);
};

/** What to show of `content`: the whole file when short or wanted whole, else padded ranges. */
const windowsOf = (content: string, ranges: ReadonlyArray<LineRange>) => {
  const total = content.split("\n").length;

  if (total < WHOLE_UNDER || ranges.length === 0)
    return { ranges: [], text: lineWindow(content, 1, total) };

  const padded = mergeRanges(
    ranges.flatMap((range) =>
      range.from > total
        ? []
        : [
            {
              from: Math.max(1, range.from - PADDING),
              through: Math.min(total, range.through + PADDING),
            },
          ],
    ),
  );

  return {
    ranges: padded,
    text: padded
      .map((range) => lineWindow(content, range.from, range.through - range.from + 1))
      .join("\n\n"),
  };
};

/** A restored file as the model reads it: its path, then its lines. */
export const restoredText = (file: RestoredFile): string => `${file.path}\n\n${file.text}`;

/** Files restored at a checkpoint, and the paths left out to stay within the cap. */
export interface Restored {
  readonly files: ReadonlyArray<RestoredFile>;
  readonly leftOut: ReadonlyArray<string>;
}

/**
 * Reads `wanted` in order while their tokens fit `cap`. A file that does not fit is left out and
 * smaller ones after it still get their turn; a file that can no longer be read is skipped.
 */
export const restore = Effect.fn("memory.restore")(function* (
  files: WorkspaceFiles["Service"],
  wanted: ReadonlyArray<Wanted>,
  cap: number,
) {
  const kept: Array<RestoredFile> = [];
  const leftOut: Array<string> = [];
  let used = 0;

  for (const file of wanted) {
    if (kept.some((each) => each.path === file.path) || leftOut.includes(file.path)) continue;

    const content = yield* Effect.option(files.read(file.path));
    if (Option.isNone(content)) continue;

    const restored = { path: file.path, ...windowsOf(content.value, file.ranges) };
    const tokens = textTokens(restoredText(restored));

    if (used + tokens > cap) leftOut.push(file.path);
    else {
      used += tokens;
      kept.push(restored);
    }
  }

  return { files: kept, leftOut } satisfies Restored;
});
