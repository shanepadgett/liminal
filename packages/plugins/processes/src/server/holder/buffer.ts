/**
 * A command's output: the first half and the last half of what it printed, and where the agent last
 * read. Output past the capacity drops the middle, and the text says so.
 */

export interface OutputBuffer {
  readonly append: (text: string) => void;
  /** Characters received so far, dropped ones included. */
  readonly length: () => number;
  /** Where the unread text starts. */
  readonly readMark: () => number;
  /** The text from character `offset` on; a dropped middle shows as one marker line. */
  readonly textFrom: (offset: number) => string;
  /** The text not read before, which is then read. */
  readonly takeUnread: () => string;
  /** The last `count` lines, or all the text when it has fewer. */
  readonly lastLines: (count: number) => string;
}

export const makeOutputBuffer = (capacity: number): OutputBuffer => {
  const half = Math.floor(capacity / 2);
  let head = "";
  let tail = "";
  let total = 0;
  let readTo = 0;

  const append = (text: string) => {
    total += text.length;
    const intoHead = text.slice(0, Math.max(0, half - head.length));
    head += intoHead;
    tail = (tail + text.slice(intoHead.length)).slice(-half);
  };

  const textFrom = (offset: number) => {
    const tailStart = total - tail.length;
    if (offset >= tailStart) return tail.slice(offset - tailStart);

    const fromHead = offset < head.length ? head.slice(offset) : "";
    const dropped = tailStart - Math.max(offset, head.length);
    if (dropped <= 0) return fromHead + tail;

    return `${fromHead}\n[${dropped} characters of output were dropped here]\n${tail}`;
  };

  const takeUnread = () => {
    const text = textFrom(readTo);
    readTo = total;

    return text;
  };

  const lastLines = (count: number) =>
    textFrom(Math.max(0, total - half))
      .trimEnd()
      .split("\n")
      .slice(-count)
      .join("\n");

  return { append, length: () => total, readMark: () => readTo, textFrom, takeUnread, lastLines };
};
