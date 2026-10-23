/**
 * A command's output as it comes, held to a cap: the first half and the latest half, with a count
 * of what fell between. `tool-output` cuts it further for the model; the cap only bounds memory for
 * a command that writes without end.
 */

/** Characters each half holds. */
const HALF = 5 * 1024 * 1024;

/** How far back from the end the last lines are looked for. */
const TAIL_SPAN = 4096;

/** Enough of the latest chunks to fill `TAIL_SPAN`, unless the chunks are tiny. */
const RECENT_CHUNKS = 8;

export interface Output {
  readonly head: string;
  /** The text after `head`, in chunks so dropping the oldest does not copy the rest. */
  readonly tail: ReadonlyArray<string>;
  readonly tailLength: number;
  /** Characters dropped from the front of the tail. */
  readonly dropped: number;
}

export const emptyOutput: Output = { head: "", tail: [], tailLength: 0, dropped: 0 };

/** The tail with its oldest chunks dropped until it fits in `HALF`. */
const trimmed = (output: Output): Output => {
  const [oldest, ...rest] = output.tail;
  if (oldest === undefined || output.tailLength <= HALF) return output;

  const over = output.tailLength - HALF;

  if (oldest.length > over) {
    return {
      ...output,
      tail: [oldest.slice(over), ...rest],
      tailLength: HALF,
      dropped: output.dropped + over,
    };
  }

  return trimmed({
    ...output,
    tail: rest,
    tailLength: output.tailLength - oldest.length,
    dropped: output.dropped + oldest.length,
  });
};

/** `output` with `text` added; the head fills first, then the tail. */
export const appended = (output: Output, text: string): Output => {
  const room = Math.max(0, HALF - output.head.length);
  const rest = text.slice(room);
  const head = output.head + text.slice(0, room);
  if (rest === "") return { ...output, head };

  return trimmed({
    ...output,
    head,
    tail: [...output.tail, rest],
    tailLength: output.tailLength + rest.length,
  });
};

/** All the output kept, with a line where the dropped part was. */
export const textOf = (output: Output) => {
  const tail = output.tail.join("");
  if (output.dropped === 0) return output.head + tail;

  const count = output.dropped.toLocaleString("en-US");

  return `${output.head}\n[${count} characters dropped]\n${tail}`;
};

/** What a terminal would show of `line`: a carriage return draws over what came before it. */
const shownOf = (line: string) => line.split("\r").findLast((part) => part.trim() !== "") ?? "";

/** The last `count` lines that hold text, read from the end without joining the whole output. */
export const lastLines = (output: Output, count: number): ReadonlyArray<string> => {
  const recent = output.head.slice(-TAIL_SPAN) + output.tail.slice(-RECENT_CHUNKS).join("");

  return recent
    .slice(-TAIL_SPAN)
    .split("\n")
    .map(shownOf)
    .filter((line) => line !== "")
    .slice(-count);
};
