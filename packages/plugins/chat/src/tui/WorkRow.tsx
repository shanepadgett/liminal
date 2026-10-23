/**
 * One line per tool call: an icon for where it stands, the tool and its input. Everything but the
 * icon sits dimmed, so the replies around the rows read first. An input too long for the line is
 * cut in the middle, keeping its end. While the model writes a call, its input inks in.
 */

import { type BoxRenderable } from "@opentui/core";
import { Predicate } from "effect";
import { createSignal, For } from "solid-js";

import type { RoleName } from "@shanepadgett/liminal-client";
import { kit, useColor, useMix } from "@shanepadgett/liminal-tui";

import type { Item, ToolStatus } from "../view/index.ts";

type ToolItem = Extract<Item, { readonly kind: "tool" }>;

const ICON: Readonly<Record<ToolStatus, { readonly glyph: string; readonly role: RoleName }>> = {
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

/** The params as the line shows them: each value, strings as written, others as JSON. */
const inputOf = (params: ToolItem["params"]) => {
  if (!Predicate.isObject(params)) return JSON.stringify(params);

  return Object.values(params)
    .map((value) => (Predicate.isString(value) ? value : JSON.stringify(value)))
    .join(" ");
};

/** Cells cut to `width` in the middle, keeping more of the end, where a command's point usually is. */
const cutMiddle = (cells: readonly string[], width: number): readonly string[] => {
  if (cells.length <= width) return cells;

  const head = Math.floor((width - 1) / 3);

  return [...cells.slice(0, head), ELLIPSIS, ...cells.slice(cells.length - (width - 1 - head))];
};

export function WorkRow(props: { readonly item: ToolItem }) {
  const color = useColor();
  const mix = useMix();
  const [box, setBox] = createSignal<BoxRenderable>();
  const [width, setWidth] = createSignal(0);

  const cells = () =>
    cutMiddle(
      kit.cellsOf(oneLine(inputOf(props.item.params))),
      Math.max(1, width() - TOOL_COLUMNS),
    );

  // A live call's newest cells warm up from the background; a saved one is settled.
  const head = kit.useInkHead(
    () => cells().length,
    () => props.item.isLive,
  );

  const runs = () =>
    kit.inkRuns(cells(), head() ?? Number.POSITIVE_INFINITY, (warmth) =>
      mix(color("surface.base"), color("text.muted"), warmth),
    );

  const icon = () => ICON[props.item.status];

  return (
    <box flexDirection="row">
      <text width={2} flexShrink={0} fg={color(icon().role)}>
        {icon().glyph}
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
          <span style={{ fg: color("text.base") }}>{props.item.name.padEnd(TOOL_COLUMNS)}</span>
          <For each={runs()}>{(run) => <span style={{ fg: run.fg }}>{run.text}</span>}</For>
        </text>
      </box>
    </box>
  );
}
