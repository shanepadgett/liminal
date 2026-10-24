/**
 * A dialog that filters a list as the user types. Rows sit under their section titles, each section
 * after a blank line and with an optional faint detail on its right; a query keeps the rows that
 * match, best first within each section, and marks the matched letters. A pick or action that
 * confirms asks in the footer first.
 */

import { TextAttributes } from "@opentui/core";
import fuzzysort from "fuzzysort";
import { For, Match, Show, Switch } from "solid-js";

import type { Hint } from "../../primitives/Hints.tsx";
import { ListRow } from "../../primitives/ListRow.tsx";
import { useColor } from "../../theme/theme.tsx";
import { Dialog } from "./Dialog.tsx";

export interface PickerRow {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly section?: string;
}

/** A row and the letters of its title the query matched. */
interface Found {
  readonly kind: "row";
  readonly row: PickerRow;
  readonly matches: readonly number[];
}

type Item =
  | { readonly kind: "section"; readonly title: string; readonly isSpaced: boolean }
  | Found;

const LIST_ROWS = 12;

/**
 * A section title goes before the first row of each section, after a blank line unless it opens the
 * list.
 */
const sectioned = (found: readonly Found[]): readonly Item[] =>
  found.flatMap((item, index): Item[] => {
    const { section } = item.row;
    const isFirst = section !== undefined && section !== found[index - 1]?.row.section;

    return isFirst ? [{ kind: "section", title: section, isSpaced: index > 0 }, item] : [item];
  });

/** The lines the items take, blank lines included. */
const linesOf = (items: readonly Item[]) =>
  items.length + items.filter((item) => item.kind === "section" && item.isSpaced).length;

/** The rows matching `query` in their sections, which keep their order; every row for none. */
const itemsOf = (rows: readonly PickerRow[], query: string): readonly Item[] => {
  if (query === "") return sectioned(rows.map((row) => ({ kind: "row", row, matches: [] })));

  const found = fuzzysort
    .go(query, rows, { key: "title" })
    .map((result): Found => ({ kind: "row", row: result.obj, matches: result.indexes }));

  const sections = [...new Set(rows.map((row) => row.section))];

  return sectioned(
    sections.flatMap((section) => found.filter((each) => each.row.section === section)),
  );
};

function ItemView(props: {
  readonly item: Item;
  readonly selected: string;
  readonly sectionDetail: ((section: string) => string | undefined) | undefined;
}) {
  const color = useColor();

  return (
    <Switch>
      <Match when={props.item.kind === "section" ? props.item : undefined}>
        {(section) => (
          <box flexDirection="row" paddingX={1} marginTop={section().isSpaced ? 1 : 0}>
            <text fg={color("text.heading")}>{section().title}</text>
            <box flexGrow={1} />
            <text flexShrink={0} fg={color("text.faint")}>
              {props.sectionDetail?.(section().title) ?? ""}
            </text>
          </box>
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
  /** A faint note at the right of a section's title, such as how many rows it holds. */
  readonly sectionDetail?: (section: string) => string | undefined;
  /** The question a pick or action asks in the footer before it runs. */
  readonly confirming?: string;
}) {
  const color = useColor();
  const items = () => itemsOf(props.rows, props.query);

  return (
    <Dialog title={props.title} hints={props.hints} confirming={props.confirming}>
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
          height={Math.min(linesOf(items()), LIST_ROWS)}
          scrollbarOptions={{ visible: false }}
        >
          <For each={items()}>
            {(item) => (
              <ItemView item={item} selected={props.selected} sectionDetail={props.sectionDetail} />
            )}
          </For>
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
