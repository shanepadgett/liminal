/**
 * File lists: the files a range of history touched, labeled by the cheap model, and the lists
 * merged as short-term memories condense into long-term ones.
 */

import { Option, Schema } from "effect";

import type { Entry, Seq } from "@liminal/sdk";

import { type LineRange, type MemoryFile, type TouchedFile, TouchedEntry } from "../contract.ts";

/** `ranges` sorted, with overlapping and touching ranges joined. */
export const mergeRanges = (ranges: ReadonlyArray<LineRange>): ReadonlyArray<LineRange> => {
  const merged: Array<LineRange> = [];

  for (const range of ranges.toSorted((a, b) => a.from - b.from)) {
    const last = merged.at(-1);

    if (last !== undefined && range.from <= last.through + 1)
      merged[merged.length - 1] = {
        from: last.from,
        through: Math.max(last.through, range.through),
      };
    else merged.push(range);
  }

  return merged;
};

/** Both files' lines; a whole file stays whole. */
const unionRanges = (a: ReadonlyArray<LineRange>, b: ReadonlyArray<LineRange>) =>
  a.length === 0 || b.length === 0 ? [] : mergeRanges([...a, ...b]);

/** A file the history touched, before the cheap model labels it. */
export interface Candidate extends TouchedFile {
  readonly seq: Seq;
}

const decodeTouchedData = Schema.decodeUnknownOption(TouchedEntry.data);

const decodeTouched = (entry: Entry) =>
  entry.kind === TouchedEntry.kind ? decodeTouchedData(entry.data) : Option.none();

/** The files `entries` touched, one per path, in the order first touched. */
export const candidatesOf = (entries: ReadonlyArray<Entry>): ReadonlyArray<Candidate> => {
  const byPath = new Map<string, Candidate>();

  for (const entry of entries) {
    const touched = decodeTouched(entry);
    if (Option.isNone(touched)) continue;

    for (const file of touched.value.files) {
      const known = byPath.get(file.path);

      byPath.set(file.path, {
        path: file.path,
        ranges:
          known === undefined ? mergeRanges(file.ranges) : unionRanges(known.ranges, file.ranges),
        edited: file.edited || (known?.edited ?? false),
        seq: entry.seq,
      });
    }
  }

  return [...byPath.values()];
};

/** The cheap model's word on one file. */
export interface Label {
  readonly path: string;
  readonly relevant: boolean;
  readonly reason: string;
}

/** A file the cheap model found in shell commands or output. */
export interface Found extends Label {
  readonly ranges: ReadonlyArray<LineRange>;
}

/** Candidates with their labels; one the model left out counts as relevant. */
export const labeled = (
  candidates: ReadonlyArray<Candidate>,
  labels: ReadonlyArray<Label>,
): ReadonlyArray<MemoryFile> =>
  candidates.map((candidate) => {
    const label = labels.find((each) => each.path === candidate.path);

    return { ...candidate, relevant: label?.relevant ?? true, reason: label?.reason ?? "" };
  });

/**
 * The found files worth keeping: not already candidates and named in the range's text, so a path
 * the model made up never reaches a memory.
 */
export const keptFound = (
  found: ReadonlyArray<Found>,
  candidates: ReadonlyArray<Candidate>,
  text: string,
  seq: Seq,
): ReadonlyArray<MemoryFile> =>
  found.flatMap((file) =>
    candidates.some((candidate) => candidate.path === file.path) || !text.includes(file.path)
      ? []
      : [
          {
            path: file.path,
            ranges: mergeRanges(file.ranges),
            edited: false,
            relevant: file.relevant,
            reason: file.reason,
            seq,
          },
        ],
  );

/**
 * The lists merged by path, `lists` oldest first: the newest label and reason win, the lines join,
 * and a file edited once stays edited.
 */
export const mergeLists = (
  lists: ReadonlyArray<ReadonlyArray<MemoryFile>>,
): ReadonlyArray<MemoryFile> => {
  const byPath = new Map<string, MemoryFile>();

  for (const file of lists.flat()) {
    const known = byPath.get(file.path);

    byPath.set(
      file.path,
      known === undefined
        ? file
        : {
            ...file,
            ranges: unionRanges(known.ranges, file.ranges),
            edited: known.edited || file.edited,
            seq: known.seq > file.seq ? known.seq : file.seq,
          },
    );
  }

  return [...byPath.values()];
};

const rangesText = (ranges: ReadonlyArray<LineRange>) =>
  ranges.map((range) => `${range.from}–${range.through}`).join(", ");

const fileLine = (file: MemoryFile) => {
  const lines = file.ranges.length === 0 ? "" : ` (lines ${rangesText(file.ranges)})`;
  const reason = file.reason === "" ? "" : `: ${file.reason}`;

  return `- ${file.path}${lines}${reason}`;
};

/** A memory's file list as the model reads it: relevant files, then those explored and set aside. */
export const filesText = (files: ReadonlyArray<MemoryFile>) => {
  const relevant = files.filter((file) => file.relevant);
  const other = files.filter((file) => !file.relevant);

  return [
    ...(relevant.length === 0 ? [] : [["Relevant files:", ...relevant.map(fileLine)].join("\n")]),
    ...(other.length === 0 ? [] : [["Explored, not relevant:", ...other.map(fileLine)].join("\n")]),
  ].join("\n\n");
};
