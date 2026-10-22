/**
 * What a reply did, one line per tool call: an icon for where it stands, the tool, its input and a
 * note. Everything but the icon sits dimmed and gray, so the replies around the rows read first. An
 * input too long for the line is cut in the middle, keeping its end; opening the row shows the
 * whole of it. While the model writes a call, its input inks in as it streams.
 */

import { type BoxRenderable } from "@opentui/core";
import { createSignal, For, Show } from "solid-js";

import { cellsOf } from "../../primitives/Gradient.tsx";
import { inkRuns } from "../../primitives/Ink.tsx";
import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";

export type WorkStatus = "running" | "done" | "failed";

export interface WorkRow {
  readonly tool: string;
  /** The call's input as the model wrote it, such as a path or a whole script. */
  readonly input: string;
  readonly status: WorkStatus;
  readonly note?: string;
  /** How many cells of the input have streamed in; all of them when left out. */
  readonly streamed?: number;
  /** Opened with a click: shows the whole input when the line had to cut it. */
  readonly isOpen?: boolean;
}

const ICON: Readonly<Record<WorkStatus, { readonly glyph: string; readonly role: RoleName }>> = {
  running: { glyph: "○", role: "text.accent" },
  done: { glyph: "✓", role: "feedback.success" },
  failed: { glyph: "×", role: "feedback.danger" },
};

const TOOL_COLUMNS = 7;

/** How much of its brightness a row keeps beside a reply. */
const ROW_OPACITY = 0.3;

const ELLIPSIS = "…";

/** A multi-line input on one line, its lines joined by a return mark. */
const oneLine = (input: string) =>
  input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ↵ ");

/** Cells cut to `width` in the middle, keeping more of the end, where a command's point usually is. */
const cutMiddle = (cells: readonly string[], width: number): readonly string[] => {
  if (cells.length <= width) return cells;

  const head = Math.floor((width - 1) / 3);

  return [...cells.slice(0, head), ELLIPSIS, ...cells.slice(cells.length - (width - 1 - head))];
};

const noteOf = (row: WorkRow) => (row.note === undefined ? "" : `  ${row.note}`);

/** The input as the line shows it, inked while it streams, and whether the line had to cut it. */
const useLine = (row: () => WorkRow, width: () => number) => {
  const color = useColor();

  const cells = () => {
    const all = cellsOf(oneLine(row().input));

    return all.slice(0, row().streamed ?? all.length);
  };

  const room = () => Math.max(1, width() - TOOL_COLUMNS - cellsOf(noteOf(row())).length);
  const shown = () => cutMiddle(cells(), room());

  const runs = () =>
    inkRuns(
      shown(),
      row().streamed === undefined ? Number.POSITIVE_INFINITY : shown().length,
      color("surface.base"),
      color("text.muted"),
    );

  const isCut = () => row().input.includes("\n") || cells().length > room();

  return { runs, isCut };
};

/** The whole input, under a row opened with a click. */
function WholeInput(props: { readonly input: string }) {
  const color = useColor();

  return (
    <box border={["left"]} borderColor={color("border.subtle")} paddingLeft={1} marginLeft={2}>
      <text fg={color("text.muted")}>{props.input}</text>
    </box>
  );
}

function Row(props: { readonly row: WorkRow }) {
  const color = useColor();
  const [box, setBox] = createSignal<BoxRenderable>();
  const [width, setWidth] = createSignal(0);
  const line = useLine(() => props.row, width);

  return (
    <box>
      <box flexDirection="row">
        <text width={2} flexShrink={0} fg={color(ICON[props.row.status].role)}>
          {ICON[props.row.status].glyph}
        </text>
        <box
          ref={setBox}
          flexGrow={1}
          opacity={ROW_OPACITY}
          onSizeChange={() => {
            setWidth(box()?.width ?? 0);
          }}
        >
          <text wrapMode="none">
            <span style={{ fg: color("text.base") }}>{props.row.tool.padEnd(TOOL_COLUMNS)}</span>
            <For each={line.runs()}>{(run) => <span style={{ fg: run.fg }}>{run.text}</span>}</For>
            <span
              style={{
                fg: color(props.row.status === "failed" ? "feedback.danger" : "text.faint"),
              }}
            >
              {noteOf(props.row)}
            </span>
          </text>
        </box>
      </box>
      <Show when={props.row.isOpen === true && line.isCut()}>
        <WholeInput input={props.row.input} />
      </Show>
    </box>
  );
}

export function WorkRows(props: { readonly rows: readonly WorkRow[] }) {
  return (
    <box flexShrink={0}>
      <For each={props.rows}>{(row) => <Row row={row} />}</For>
    </box>
  );
}
