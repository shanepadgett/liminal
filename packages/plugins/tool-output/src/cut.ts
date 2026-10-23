/** Long text cut to its first and last halves around a line that says where the whole text is. */

/** Text over this many lines is cut. */
const MAX_LINES = 2000;

/** Text over this many bytes is cut. */
const MAX_BYTES = 50 * 1024;

const encoder = new TextEncoder();

const decoder = new TextDecoder();

export const isLong = (text: string) =>
  encoder.encode(text).length > MAX_BYTES || text.split("\n").length > MAX_LINES;

/** At most half the lines and half the bytes, from the start or the end; a split character is lost. */
const halfOf = (lines: ReadonlyArray<string>, end: "first" | "last") => {
  const half = end === "first" ? lines.slice(0, MAX_LINES / 2) : lines.slice(-MAX_LINES / 2);
  const bytes = encoder.encode(half.join("\n"));
  const kept = end === "first" ? bytes.subarray(0, MAX_BYTES / 2) : bytes.subarray(-MAX_BYTES / 2);

  return decoder.decode(kept);
};

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** `text`'s halves around a line giving its size and `where` the whole text is. */
export const cutText = (text: string, where: string) => {
  const lines = text.split("\n");
  const count = lines.length.toLocaleString("en-US");
  const marker = `[Output cut: ${count} lines, ${sizeOf(encoder.encode(text).length)}. ${where}]`;

  return [halfOf(lines, "first"), marker, halfOf(lines, "last")].join("\n");
};
