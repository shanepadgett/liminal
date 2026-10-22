/**
 * A dialog that filters a list as the user types. With no query the rows sit under their section
 * titles; with one, `fuzzysort` orders them by match and marks the matched letters.
 */

import { TextAttributes } from "@opentui/core";
import fuzzysort from "fuzzysort";
import { For, Match, Show, Switch } from "solid-js";

import { useColor } from "../colors.ts";
import { Dialog } from "./Dialog.tsx";
import type { Hint } from "./Hints.tsx";
import { ListRow } from "./ListRow.tsx";

export interface PickerRow {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly section?: string;
}

type Item =
  | { readonly kind: "section"; readonly title: string }
  | { readonly kind: "row"; readonly row: PickerRow; readonly matches: readonly number[] };

const LIST_ROWS = 12;

/** A section title goes before the first row of each section. */
const sectioned = (rows: readonly PickerRow[]): readonly Item[] =>
  rows.flatMap((row, index): Item[] => {
    const item: Item = { kind: "row", row, matches: [] };
    const isFirst = row.section !== undefined && row.section !== rows[index - 1]?.section;

    return isFirst ? [{ kind: "section", title: row.section }, item] : [item];
  });

const itemsOf = (rows: readonly PickerRow[], query: string): readonly Item[] =>
  query === ""
    ? sectioned(rows)
    : fuzzysort
        .go(query, rows, { key: "title" })
        .map((result) => ({ kind: "row", row: result.obj, matches: result.indexes }));

function ItemView(props: { readonly item: Item; readonly selected: string }) {
  const color = useColor();

  return (
    <Switch>
      <Match when={props.item.kind === "section" ? props.item : undefined}>
        {(section) => (
          <text fg={color("text.heading")} paddingLeft={1}>
            {section().title}
          </text>
        )}
      </Match>
      <Match when={props.item.kind === "row" ? props.item : undefined}>
        {(row) => (
          <ListRow
            title={row().row.title}
            detail={row().row.detail}
            matches={row().matches}
            isSelected={row().row.id === props.selected}
          />
        )}
      </Match>
    </Switch>
  );
}

export function Picker(props: {
  readonly title: string;
  readonly placeholder: string;
  /** Shown when there are no rows at all. */
  readonly empty: string;
  readonly rows: readonly PickerRow[];
  readonly query: string;
  /** The id of the selected row. */
  readonly selected: string;
  readonly hints: readonly Hint[];
}) {
  const color = useColor();
  const items = () => itemsOf(props.rows, props.query);

  return (
    <Dialog title={props.title} hints={props.hints}>
      <box flexDirection="row" marginBottom={1}>
        <text flexShrink={0} fg={color("text.accent")} attributes={TextAttributes.BOLD}>
          {"> "}
        </text>
        <input
          flexGrow={1}
          value={props.query}
          placeholder={props.placeholder}
          placeholderColor={color("text.ghost")}
          textColor={color("text.base")}
          backgroundColor={color("surface.overlay")}
        />
      </box>
      <Show
        when={items().length > 0}
        fallback={
          <text fg={color("text.faint")}>{props.query === "" ? props.empty : "No matches"}</text>
        }
      >
        <scrollbox
          height={Math.min(items().length, LIST_ROWS)}
          scrollbarOptions={{ visible: false }}
        >
          <For each={items()}>{(item) => <ItemView item={item} selected={props.selected} />}</For>
        </scrollbox>
      </Show>
    </Dialog>
  );
}

export const PICKER_HINTS: readonly Hint[] = [
  { keys: "↑↓", label: "choose" },
  { keys: "enter", label: "select" },
  { keys: "esc", label: "close" },
];
