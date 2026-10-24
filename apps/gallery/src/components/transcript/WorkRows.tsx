/**
 * What a reply did, one line per tool call: an icon for where it stands, the tool, its input and an
 * optional note such as `+3 -1`. Everything but the icon sits dimmed, so the replies around the
 * rows read first. An input too long for the line is cut in the middle, keeping its end. While the
 * model writes a call, its input inks in. A row with details brightens under the mouse, and a click
 * opens or closes the details under it.
 */

import { type BoxRenderable } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { createSignal, For, Show } from "solid-js";

import { cellsOf } from "../../primitives/Gradient.tsx";
import { inkRuns } from "../../primitives/Ink.tsx";
import { mixHex } from "../../theme/oklch.ts";
import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";

export type WorkStatus = "running" | "done" | "failed";

export interface WorkRow {
  readonly tool: string;
  /** What the line shows: a path, a query, or a command's description. */
  readonly input: string;
  readonly status: WorkStatus;
  /** A short fact after the input, such as `+3 -1` or `2 edits`. */
  readonly note?: string;
  /** How many cells of the input have streamed in; all of them when left out. */
  readonly streamed?: number;
  /** What a click opens under the row, such as the call's output; without it the row stays still. */
  readonly details?: () => JSX.Element;
  /** Whether the details start open. */
  readonly isOpen?: boolean;
  /** A running command's last lines, under the row. */
  readonly tail?: readonly string[];
}

const ICON: Readonly<Record<WorkStatus, { readonly glyph: string; readonly role: RoleName }>> = {
  running: { glyph: "○", role: "text.accent" },
  done: { glyph: "✓", role: "feedback.success" },
  failed: { glyph: "×", role: "feedback.danger" },
};

/** The columns a tool's name takes with its gap; a longer name keeps one space after it. */
const TOOL_COLUMNS = 7;

/** How much of its brightness a row keeps beside a reply. */
const ROW_OPACITY = 0.3;

/** How much a row with details keeps under the mouse. */
const HOVER_OPACITY = 0.5;

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

/** Lines under a row behind a thin rule, such as a command's output. */
export function DetailLines(props: { readonly lines: readonly string[] }) {
  const color = useColor();

  return (
    <box marginLeft={2} paddingLeft={1} border={["left"]} borderColor={color("border.subtle")}>
      <For each={props.lines}>
        {(line) => (
          <text wrapMode="none" fg={color("text.faint")}>
            {line}
          </text>
        )}
      </For>
    </box>
  );
}

/** The input as the line shows it, inked while it streams. */
const useRuns = (row: () => WorkRow, room: () => number) => {
  const color = useColor();

  const cells = () => {
    const all = cellsOf(oneLine(row().input));

    return cutMiddle(all.slice(0, row().streamed ?? all.length), room());
  };

  return () =>
    inkRuns(
      cells(),
      row().streamed === undefined ? Number.POSITIVE_INFINITY : cells().length,
      (warmth) => mixHex(color("surface.base"), color("text.muted"), warmth),
    );
};

function Row(props: { readonly row: WorkRow }) {
  const color = useColor();
  const [box, setBox] = createSignal<BoxRenderable>();
  const [width, setWidth] = createSignal(0);
  const [isHovered, setHovered] = createSignal(false);
  const [isOpen, setOpen] = createSignal(props.row.isOpen === true);
  const hasDetails = () => props.row.details !== undefined;
  const note = () => (props.row.note === undefined ? "" : `  ${props.row.note}`);
  const label = () => `${props.row.tool.padEnd(TOOL_COLUMNS - 1)} `;

  const runs = useRuns(
    () => props.row,
    () => Math.max(1, width() - cellsOf(label()).length - cellsOf(note()).length),
  );

  return (
    <box>
      <box
        flexDirection="row"
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
        onMouseUp={() => {
          if (hasDetails()) setOpen(!isOpen());
        }}
      >
        <text width={2} flexShrink={0} fg={color(ICON[props.row.status].role)}>
          {ICON[props.row.status].glyph}
        </text>
        <box
          ref={setBox}
          flexGrow={1}
          opacity={isHovered() && hasDetails() ? HOVER_OPACITY : ROW_OPACITY}
          onSizeChange={() => {
            setWidth(box()?.width ?? 0);
          }}
        >
          <text wrapMode="none">
            <span style={{ fg: color("text.base") }}>{label()}</span>
            <For each={runs()}>{(run) => <span style={{ fg: run.fg }}>{run.text}</span>}</For>
            <span style={{ fg: color("text.faint") }}>{note()}</span>
          </text>
        </box>
      </box>
      <Show when={isOpen() ? props.row.details : undefined}>{(details) => details()()}</Show>
      <Show when={props.row.status === "running" ? props.row.tail : undefined}>
        {(tail) => <DetailLines lines={tail()} />}
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
