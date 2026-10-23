/** What a process has shown: `@xterm/headless` behind a small interface. */
import { type IBuffer, type IMarker, Terminal } from "@xterm/headless";
import { Effect, Option } from "effect";

import { COLUMNS, ROWS } from "./pty.ts";

/** Lines the normal buffer keeps above the screen. */
const SCROLLBACK = 5000;

export const DROPPED = "[earlier output dropped]";

export interface Screen {
  /** Takes output as it comes; the terminal parses it in order. */
  readonly write: (data: Uint8Array) => void;
  /**
   * When the newest output not yet read came, in milliseconds since the epoch; none when all is
   * read.
   */
  readonly unread: Effect.Effect<Option.Option<number>>;
  /** The lines that changed since the last read, and moves the mark to the screen's top. */
  readonly readNew: Effect.Effect<ReadonlyArray<string>>;
}

interface Row {
  readonly text: string;
  /** Continues the row above, which was too long for the screen. */
  readonly wrapped: boolean;
}

/** What the last read returned, to compare the next read with. */
interface Shown {
  readonly buffer: IBuffer["type"];
  /** The rows from the mark on. */
  readonly rows: ReadonlyArray<Row>;
  /** Where the normal buffer's screen began; output above it cannot change any more. */
  readonly mark: IMarker | undefined;
}

/** The buffer's rows from `from` on, without the empty rows at the end. */
const rowsFrom = (buffer: IBuffer, from: number): ReadonlyArray<Row> => {
  const rows = Array.from({ length: Math.max(buffer.length - from, 0) }, (_, index) => {
    const line = buffer.getLine(from + index);

    return { text: line?.translateToString(true) ?? "", wrapped: line?.isWrapped ?? false };
  });

  const last = rows.findLastIndex((row) => row.text !== "");

  return rows.slice(0, last + 1);
};

/** The rows from the first one that differs from what was shown. */
const changed = (before: ReadonlyArray<Row>, after: ReadonlyArray<Row>) => {
  const first = after.findIndex((row, index) => {
    const previous = before.at(index);

    return row.text !== previous?.text || row.wrapped !== previous.wrapped;
  });

  return first === -1 ? [] : after.slice(first);
};

/** Rows as lines, with each wrapped row joined to the line it continues. */
const linesOf = (rows: ReadonlyArray<Row>) => {
  const starts = rows.flatMap((row, index) => (row.wrapped && index > 0 ? [] : [index]));

  return starts.map((start, index) =>
    rows
      .slice(start, starts[index + 1])
      .map((row) => row.text)
      .join(""),
  );
};

/** A full-screen program's screen, compared with its last one. */
const readAlternate = (buffer: IBuffer, shown: Shown) => {
  shown.mark?.dispose();
  const rows = rowsFrom(buffer, 0);
  const lines = shown.buffer === "alternate" ? changed(shown.rows, rows) : rows;

  return { shown: { buffer: buffer.type, rows, mark: undefined }, lines: linesOf(lines) };
};

/** Where the normal buffer's new lines start, and what was shown there. */
const baselineOf = (buffer: IBuffer, shown: Shown) => {
  // Back from the full screen: the normal screen as it stands.
  if (shown.buffer === "alternate") return { from: buffer.baseY, before: [], isDropped: false };
  if (shown.mark?.isDisposed === true) return { from: 0, before: [], isDropped: true };

  return { from: shown.mark?.line ?? 0, before: shown.rows, isDropped: false };
};

/** The normal buffer from the mark on, compared with what was shown there. */
const readNormal = (terminal: Terminal, shown: Shown) => {
  const buffer = terminal.buffer.active;
  const { from, before, isDropped } = baselineOf(buffer, shown);
  const lines = linesOf(changed(before, rowsFrom(buffer, from)));
  shown.mark?.dispose();

  const next: Shown = {
    buffer: buffer.type,
    rows: rowsFrom(buffer, buffer.baseY),
    mark: terminal.registerMarker(-buffer.cursorY),
  };

  return { shown: next, lines: isDropped ? [DROPPED, ...lines] : lines };
};

/** A terminal the size of the PTY. */
export const makeScreen = Effect.acquireRelease(
  Effect.sync(() => {
    const terminal = new Terminal({
      cols: COLUMNS,
      rows: ROWS,
      scrollback: SCROLLBACK,
      allowProposedApi: true,
    });

    let shown: Shown = { buffer: "normal", rows: [], mark: undefined };
    let outputAt = 0;
    let readAt = Date.now();

    // Resolves once everything written before it is parsed.
    const parsed = Effect.callback<void>((resume) => {
      terminal.write("", () => {
        resume(Effect.void);
      });
    });

    const screen: Screen = {
      write: (data) => {
        outputAt = Date.now();
        terminal.write(data);
      },
      unread: Effect.sync(() => (outputAt > readAt ? Option.some(outputAt) : Option.none())),
      readNew: Effect.map(parsed, () => {
        const buffer = terminal.buffer.active;

        const read =
          buffer.type === "alternate" ? readAlternate(buffer, shown) : readNormal(terminal, shown);

        shown = read.shown;
        readAt = Date.now();

        return read.lines;
      }),
    };

    return { terminal, screen };
  }),
  ({ terminal }) =>
    Effect.sync(() => {
      terminal.dispose();
    }),
).pipe(Effect.map(({ screen }) => screen));
