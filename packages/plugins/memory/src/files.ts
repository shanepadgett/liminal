/** Reading files back in after a checkpoint, as `read` shows them, up to `FILES_MAX` tokens. */
import { Effect, FileSystem, Option, Path, Schema } from "effect";

import { Directories } from "@shanepadgett/liminal-directories/contract";
import { isBinary, pageOf } from "@shanepadgett/liminal-tools-read/contract";

import { estimate, FILES_MAX } from "./measure.ts";

/** A file shorter than this many lines is read whole, whatever ranges are asked. */
const WHOLE_UNDER = 300;

/** Lines read on each side of an asked range. */
const PADDING = 20;

const LineRange = Schema.Struct({
  start: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  end: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});

type LineRange = typeof LineRange.Type;

export const FileRange = Schema.Struct({
  path: Schema.String.annotate({ description: "Relative to the workspace, or absolute." }),
  ranges: Schema.optionalKey(
    Schema.Array(LineRange).annotate({
      description: "The lines you need, from 1; leave out to read the whole file.",
    }),
  ),
});

export type FileRange = typeof FileRange.Type;

export interface ReadBack {
  readonly path: string;
  /** Numbered lines, as `read` shows them. */
  readonly text: string;
}

export interface ReadBacks {
  readonly read: ReadonlyArray<ReadBack>;
  /** Paths left out: past the budget, binary or unreadable. */
  readonly skipped: ReadonlyArray<string>;
}

/** `ranges` widened by `PADDING`, sorted, and joined where they touch. */
const merged = (ranges: ReadonlyArray<LineRange>): ReadonlyArray<LineRange> => {
  const joined: LineRange[] = [];

  for (const { start, end } of ranges.toSorted((first, second) => first.start - second.start)) {
    const padded = { start: Math.max(1, start - PADDING), end: Math.max(start, end) + PADDING };
    const last = joined.at(-1);

    if (last !== undefined && padded.start <= last.end + 1) {
      joined[joined.length - 1] = { start: last.start, end: Math.max(last.end, padded.end) };
    } else {
      joined.push(padded);
    }
  }

  return joined;
};

/** The parts of `text` that `file` asks for, as `read` pages them. */
const pagesOf = (text: string, file: FileRange): Option.Option<string> => {
  const ranges = file.ranges ?? [];
  if (ranges.length === 0 || text.split("\n").length < WHOLE_UNDER) return pageOf(text);

  const pages = merged(ranges).flatMap(({ start, end }) =>
    Option.toArray(pageOf(text, start, end - start + 1)),
  );

  return pages.length === 0 ? Option.none() : Option.some(pages.join("\n…\n"));
};

export const makeReadBack = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workspace } = yield* Directories;

  const readOne = (file: FileRange) =>
    fs.readFile(path.resolve(workspace, file.path)).pipe(
      Effect.map((bytes) =>
        isBinary(bytes) ? Option.none() : pagesOf(new TextDecoder().decode(bytes), file),
      ),
      Effect.orElseSucceed(() => Option.none<string>()),
    );

  return Effect.fn("Memory.readBack")(function* (files: ReadonlyArray<FileRange>) {
    const read: ReadBack[] = [];
    const skipped: string[] = [];
    let tokens = 0;

    for (const file of files) {
      const text = yield* readOne(file);
      const size = Option.match(text, { onNone: () => 0, onSome: estimate });

      if (Option.isNone(text) || tokens + size > FILES_MAX) {
        skipped.push(file.path);
        continue;
      }

      tokens += size;
      read.push({ path: file.path, text: text.value });
    }

    return { read, skipped } satisfies ReadBacks;
  });
});
