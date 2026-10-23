/** How a file reads as text, shared by `read` and anything that shows a file the same way. */
import { Effect, type FileSystem, Option, type Path } from "effect";

/** A page holds at most this many lines. */
export const MAX_LINES = 2000;

/** A page, footer included, holds at most this many bytes. */
const MAX_BYTES = 50 * 1024;

/** A line longer than this many characters is cut. */
const MAX_LINE_CHARS = 2000;

/** Room kept for the footer within `MAX_BYTES`. */
const FOOTER_BYTES = 100;

/** Git calls a file binary when its first 8 KB hold a NUL byte. */
const BINARY_PROBE_BYTES = 8000;

export const isBinary = (bytes: Uint8Array) => bytes.subarray(0, BINARY_PROBE_BYTES).includes(0);

/** `folder`'s entries, sorted, each folder's ending in `/`. */
export const entriesOf = Effect.fn("entriesOf")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  folder: string,
) {
  const names = (yield* fs.readDirectory(folder)).toSorted();

  return yield* Effect.forEach(
    names,
    (name) =>
      Effect.map(Effect.option(fs.stat(path.join(folder, name))), (info) =>
        Option.exists(info, ({ type }) => type === "Directory") ? `${name}/` : name,
      ),
    { concurrency: 16 },
  );
});

/** `text`'s lines; a newline at the end starts no line of its own. */
const linesOf = (text: string) => {
  if (text === "") return [];

  const lines = text.split("\n");

  return text.endsWith("\n") ? lines.slice(0, -1) : lines;
};

const numbered = (line: string, number: number) =>
  line.length > MAX_LINE_CHARS
    ? `${number}: ${line.slice(0, MAX_LINE_CHARS)} [line cut at ${MAX_LINE_CHARS} characters]`
    : `${number}: ${line}`;

/**
 * `text` from line `offset` (from 1), numbered `12: text`: at most `limit` lines, 2,000 lines and
 * 50 KB, with a footer saying where to read on when lines follow. None when `offset` is past the
 * end.
 */
export const pageOf = (text: string, offset = 1, limit = MAX_LINES): Option.Option<string> => {
  const lines = linesOf(text);
  if (lines.length === 0 && offset === 1) return Option.some("[empty file]");
  if (offset > lines.length) return Option.none();

  const encoder = new TextEncoder();
  const room = offset - 1 + MAX_LINES < lines.length ? MAX_LINES - 1 : MAX_LINES;
  const wanted = lines.slice(offset - 1, offset - 1 + Math.min(limit, room));
  const kept: string[] = [];
  let bytes = 0;

  for (const [index, line] of wanted.entries()) {
    const shown = numbered(line, offset + index);
    bytes += encoder.encode(shown).length + 1;
    if (bytes > MAX_BYTES - FOOTER_BYTES) break;
    kept.push(shown);
  }

  const last = offset + kept.length - 1;
  if (last >= lines.length) return Option.some(kept.join("\n"));

  const footer = `[lines ${offset}-${last} of ${lines.length}; read on with offset ${last + 1}]`;

  return Option.some([...kept, footer].join("\n"));
};
