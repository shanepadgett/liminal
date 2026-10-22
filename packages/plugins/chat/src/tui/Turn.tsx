/**
 * One turn: what the user sent, on its own raised band, then everything the reply did. Tool rows
 * stack without space between them; every other item has a blank line above it.
 */

import { Dynamic } from "@opentui/solid";
import { createSignal, For, Match, Show, Switch } from "solid-js";

import { kit, useColor, useMix } from "@shanepadgett/liminal-tui";

import type { Item, Turn as TurnData } from "../view/index.ts";
import { Notice } from "./Notice.tsx";
import { Reply } from "./Reply.tsx";
import type { ItemView } from "./slots.ts";
import { WorkRow } from "./WorkRow.tsx";

/** Each event kind another plugin draws, and its component. */
export type Renderers = ReadonlyMap<string, ItemView["component"]>;

/** The most rows an input takes in the transcript; past them it ends in an ellipsis. */
const PROMPT_ROWS = 3;

const BAR = "▌";

const ELLIPSIS = "…";

/** A word's cells cut into pieces that each fit on a line. */
const piecesOf = (word: string, columns: number): readonly string[] => {
  const cells = kit.cellsOf(word);
  const count = Math.max(1, Math.ceil(cells.length / columns));

  return Array.from({ length: count }, (_, index) =>
    cells.slice(index * columns, (index + 1) * columns).join(""),
  );
};

/** One paragraph word-wrapped to `columns` cells. */
const wrap = (paragraph: string, columns: number): readonly string[] => {
  const lines: string[] = [];
  let line = "";

  for (const piece of paragraph.split(" ").flatMap((word) => piecesOf(word, columns))) {
    const joined = line === "" ? piece : `${line} ${piece}`;

    if (kit.cellsOf(joined).length <= columns) {
      line = joined;
      continue;
    }

    lines.push(line);
    line = piece;
  }

  lines.push(line);

  return lines;
};

/** `text` word-wrapped to `columns` cells, at most `rows` lines, the last cut ending in `…`. */
const clampedLinesOf = (text: string, columns: number, rows: number): readonly string[] => {
  const lines = text.split("\n").flatMap((paragraph) => wrap(paragraph, columns));

  if (lines.length <= rows) return lines;

  const last = kit
    .cellsOf(lines[rows - 1] ?? "")
    .slice(0, columns - 1)
    .join("")
    .trimEnd();

  return [...lines.slice(0, rows - 1), `${last}${ELLIPSIS}`];
};

/**
 * What the user sent, on the raised surface behind a bar that runs the composer's gradient, so it
 * reads apart from the replies. Up to three rows; a longer input ends in an ellipsis.
 */
export function Prompt(props: { readonly input: string }) {
  const color = useColor();
  const mix = useMix();
  const [columns, setColumns] = createSignal(0);

  // Nothing until the band is measured, so the first frame does not wrap at the wrong width.
  const lines = () => (columns() > 0 ? clampedLinesOf(props.input, columns(), PROMPT_ROWS) : []);

  const bars = () =>
    kit.gradientOf(mix, color("gradient.from"), color("gradient.to"), lines().length);

  return (
    <box flexDirection="row" flexShrink={0} backgroundColor={color("surface.raised")}>
      <box width={2} flexShrink={0}>
        <For each={bars()}>{(bar) => <text fg={bar}>{BAR}</text>}</For>
      </box>
      <box
        flexGrow={1}
        marginRight={1}
        onSizeChange={function () {
          setColumns(this.width);
        }}
      >
        <For each={lines()}>
          {(line) => (
            <text wrapMode="none" fg={color("text.base")}>
              {line}
            </text>
          )}
        </For>
      </box>
    </box>
  );
}

type ItemOf<K extends Item["kind"]> = Extract<Item, { readonly kind: K }>;

const isKind = <K extends Item["kind"]>(item: Item, kind: K): item is ItemOf<K> =>
  item.kind === kind;

/** `item` when it is of `kind`, for `Match`. */
const asKind = <K extends Item["kind"]>(item: Item, kind: K): ItemOf<K> | undefined =>
  isKind(item, kind) ? item : undefined;

function ItemBody(props: { readonly item: Item; readonly renderers: Renderers }) {
  return (
    <Switch>
      <Match when={asKind(props.item, "input")}>{(input) => <Prompt input={input().text} />}</Match>
      <Match when={asKind(props.item, "reply")}>
        {(reply) => (
          <Reply text={reply().text} streamed={reply().isLive ? reply().text.length : undefined} />
        )}
      </Match>
      <Match when={asKind(props.item, "tool")}>{(tool) => <WorkRow item={tool()} />}</Match>
      <Match when={asKind(props.item, "notice")}>
        {(notice) => <Notice level={notice().level} text={notice().text} />}
      </Match>
      <Match when={asKind(props.item, "event")}>
        {(event) => (
          <Show when={props.renderers.get(event().event.kind)}>
            {(component) => <Dynamic component={component()} event={event().event} />}
          </Show>
        )}
      </Match>
    </Switch>
  );
}

export function Turn(props: {
  readonly turn: TurnData;
  /** Left out for the latest turn, whose input is pinned above the transcript instead. */
  readonly showsInput: boolean;
  readonly renderers: Renderers;
}) {
  const isToolAt = (index: number) => props.turn.items[index]?.kind === "tool";

  const spaceAbove = (index: number) =>
    index === 0 || (isToolAt(index) && isToolAt(index - 1)) ? 0 : 1;

  return (
    <box flexShrink={0} gap={1} marginBottom={1}>
      <Show when={props.showsInput && props.turn.input}>
        {(input) => <Prompt input={input()} />}
      </Show>
      <box paddingLeft={3}>
        <For each={props.turn.items}>
          {(item, index) => (
            <box flexShrink={0} marginTop={spaceAbove(index())}>
              <ItemBody item={item} renderers={props.renderers} />
            </box>
          )}
        </For>
      </box>
    </box>
  );
}
