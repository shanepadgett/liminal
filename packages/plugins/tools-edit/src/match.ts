/**
 * How `edit` finds each `oldText` in a file and changes it. Every edit is found in the file as it
 * was, exactly first; when that fails, line by line with trailing whitespace and typographic
 * characters made plain, as Pi's `edit-diff.ts` does. A plain match changes only the lines it
 * covers.
 */
import { Effect } from "effect";

import { ToolFailed } from "@shanepadgett/liminal-tools/contract";

export interface Edit {
  readonly oldText: string;
  readonly newText: string;
}

/** Where one edit lands in the file, and what replaces that span. */
interface Match {
  readonly edit: number;
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

export const toLf = (text: string) => text.replaceAll("\r\n", "\n");

/** A line as the plain pass compares it. */
const plainLine = (line: string) =>
  line
    .normalize("NFKC")
    .trimEnd()
    .replaceAll(/[\u2018\u2019\u201A\u201B]/gu, "'")
    .replaceAll(/[\u201C\u201D\u201E\u201F]/gu, '"')
    .replaceAll(/[\u2010-\u2015\u2212]/gu, "-")
    .replaceAll(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/gu, " ");

const plainOf = (text: string) => text.split("\n").map(plainLine).join("\n");

const countOf = (text: string, part: string) => text.split(part).length - 1;

/** How many line breaks come before `index`: the line `index` lies on, from 0. */
const lineAt = (text: string, index: number) => countOf(text.slice(0, index), "\n");

/** Where each line starts, then one past the end of the text, as if a line break ended it. */
const lineStarts = (text: string) => {
  let start = 0;

  const starts = text.split("\n").map((line) => {
    const current = start;
    start += line.length + 1;

    return current;
  });

  return [...starts, start];
};

/** Where `line` ends in text whose line starts are `starts`: its line break, or the text's end. */
const lineEnd = (line: number, starts: ReadonlyArray<number>) => (starts[line + 1] ?? 0) - 1;

const failed = (message: string) => new ToolFailed({ message });

const notFound = () => failed("oldText is not in the file. Read it and copy the text.");

const foundMany = (count: number) =>
  failed(`oldText is in the file ${count} times; add lines around it so it is found once.`);

/** The edit's place in the file found plainly: the lines it covers, with the match replaced. */
const plainMatch = Effect.fn("plainMatch")(function* (
  text: string,
  { oldText, newText }: Edit,
  edit: number,
) {
  const plain = plainOf(text);
  const wanted = plainOf(oldText);
  const count = wanted === "" ? 0 : countOf(plain, wanted);
  if (count === 0) return yield* notFound();
  if (count > 1) return yield* foundMany(count);

  const at = plain.indexOf(wanted);
  const first = lineAt(plain, at);
  const last = lineAt(plain, at + wanted.length);
  const plainStarts = lineStarts(plain);
  const starts = lineStarts(text);

  const match: Match = {
    edit,
    start: starts[first] ?? 0,
    end: lineEnd(last, starts),
    replacement:
      plain.slice(plainStarts[first], at)
      + newText
      + plain.slice(at + wanted.length, lineEnd(last, plainStarts)),
  };

  return match;
});

/** The edit's one place in the file, exact or plain. */
const matchOf = Effect.fn("matchOf")(function* (text: string, edit: Edit, index: number) {
  if (edit.oldText === "") return yield* failed("oldText is empty; give the text to replace.");

  const count = countOf(text, edit.oldText);
  if (count > 1) return yield* foundMany(count);
  if (count === 0) return yield* plainMatch(text, edit, index);

  const start = text.indexOf(edit.oldText);

  const match: Match = {
    edit: index,
    start,
    end: start + edit.oldText.length,
    replacement: edit.newText,
  };

  return match;
});

/** The matches in file order; two that share text fail. */
const inOrder = Effect.fn("inOrder")(function* (matches: ReadonlyArray<Match>) {
  const sorted = matches.toSorted((left, right) => left.start - right.start);

  const clash = sorted.findIndex(
    (match, index) => (sorted[index + 1]?.start ?? match.end) < match.end,
  );

  const [first, second] = [sorted[clash], sorted[clash + 1]];

  if (first !== undefined && second !== undefined) {
    const low = Math.min(first.edit, second.edit) + 1;
    const high = Math.max(first.edit, second.edit) + 1;

    return yield* failed(`Edits ${low} and ${high} change the same text; join them into one.`);
  }

  return sorted;
});

/** `text` with every edit made. Line endings in `text` and the edits are LF. */
export const applyEdits = Effect.fn("applyEdits")(function* (
  text: string,
  edits: ReadonlyArray<Edit>,
) {
  const label = (index: number) =>
    edits.length > 1 ? `Edit ${index + 1} of ${edits.length}: ` : "";

  const matches = yield* Effect.forEach(edits, (edit, index) =>
    matchOf(text, edit, index).pipe(
      Effect.mapError(({ message }) => failed(label(index) + message)),
    ),
  );

  const sorted = yield* inOrder(matches);
  const ends = [0, ...sorted.map(({ end }) => end)];

  const changed = [
    ...sorted.flatMap((match, index) => [text.slice(ends[index], match.start), match.replacement]),
    text.slice(ends.at(-1)),
  ].join("");

  if (changed === text) return yield* failed("The edits change nothing; newText equals oldText.");

  return changed;
});
