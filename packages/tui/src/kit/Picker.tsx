/**
 * A dialog that filters a list as the user types. With no query the rows sit under their section
 * titles; with one, `fuzzysort` orders them by match and marks the matched letters. It keeps its
 * own query and selection: up and down move, enter picks, esc closes, and each action's key runs it
 * on the selected row.
 */

import { type InputRenderable, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { Predicate } from "effect";
import fuzzysort from "fuzzysort";
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  Show,
  Switch,
} from "solid-js";

import { useColor } from "../colors.ts";
import { type Command, keymapCommand, useHints } from "../commands.ts";
import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";

export interface PickerRow {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly section?: string;
}

/** A key beyond up, down, enter and esc, such as `ctrl+d` to delete the selected row. */
export interface PickerAction {
  readonly key: string;
  /**
   * What the hint calls it; a function names it for the selected row, as `favorite` or
   * `unfavorite`.
   */
  readonly label: string | ((row: PickerRow) => string);
  readonly run: (row: PickerRow) => void;
  /** Leaves the picker open after it runs; without it, the picker closes. */
  readonly keepsOpen?: boolean;
}

export interface PickerProps {
  readonly title: string;
  readonly placeholder: string;
  /** Shown when there are no rows at all. */
  readonly empty: string;
  readonly rows: Accessor<ReadonlyArray<PickerRow>>;
  /** The id of the row selected when it opens; the first row without it. */
  readonly initial?: string | undefined;
  readonly actions: ReadonlyArray<PickerAction>;
  readonly onSelect: (row: PickerRow) => void;
  /** The selection moved to `row`. */
  readonly onMove?: (row: PickerRow) => void;
  /** Closed with esc, without a pick. */
  readonly onClose?: () => void;
}

type Item =
  | { readonly kind: "section"; readonly title: string; readonly isSpaced: boolean }
  | { readonly kind: "row"; readonly row: PickerRow; readonly matches: readonly number[] };

const LIST_ROWS = 12;

/**
 * A section title goes before the first row of each section, after a blank line unless it opens the
 * list.
 */
const sectioned = (rows: ReadonlyArray<PickerRow>): readonly Item[] =>
  rows.flatMap((row, index): Item[] => {
    const item: Item = { kind: "row", row, matches: [] };
    const isFirst = row.section !== undefined && row.section !== rows[index - 1]?.section;

    return isFirst ? [{ kind: "section", title: row.section, isSpaced: index > 0 }, item] : [item];
  });

/** The lines the items take, blank lines included. */
const linesOf = (items: readonly Item[]) =>
  items.length + items.filter((item) => item.kind === "section" && item.isSpaced).length;

const itemsOf = (rows: ReadonlyArray<PickerRow>, query: string): readonly Item[] =>
  query === ""
    ? sectioned(rows)
    : fuzzysort
        .go(query, rows, { key: "title" })
        .map((result) => ({ kind: "row", row: result.obj, matches: result.indexes }));

const rowId = (id: string) => `picker-row-${id}`;

function ItemView(props: { readonly item: Item; readonly selected: string | undefined }) {
  const color = useColor();

  return (
    <Switch>
      <Match when={props.item.kind === "section" ? props.item : undefined}>
        {(section) => (
          <text fg={color("text.heading")} paddingLeft={1} marginTop={section().isSpaced ? 1 : 0}>
            {section().title}
          </text>
        )}
      </Match>
      <Match when={props.item.kind === "row" ? props.item : undefined}>
        {(row) => (
          <box id={rowId(row().row.id)}>
            <ListRow
              title={row().row.title}
              detail={row().row.detail}
              matches={row().matches}
              isSelected={row().row.id === props.selected}
            />
          </box>
        )}
      </Match>
    </Switch>
  );
}

/** The query, the items it shows and the selected row; a new query selects the first match. */
const usePickerState = (props: PickerProps) => {
  const [query, setQuery] = createSignal("");
  const [chosen, setChosen] = createSignal(props.initial);
  const items = createMemo(() => itemsOf(props.rows(), query()));
  const rows = createMemo(() => items().flatMap((item) => (item.kind === "row" ? [item.row] : [])));
  const selected = createMemo(() => rows().find((row) => row.id === chosen()) ?? rows()[0]);

  const search = (next: string) => {
    setQuery(next);
    setChosen(undefined);
  };

  const move = (by: number) => {
    const all = rows();
    const at = all.findIndex((row) => row.id === selected()?.id);
    const next = all[(at + by + all.length) % all.length];
    if (next !== undefined) setChosen(next.id);
  };

  createEffect(
    on(
      selected,
      (row) => {
        if (row !== undefined) props.onMove?.(row);
      },
      { defer: true },
    ),
  );

  return { query, items, rows, selected, search, move };
};

const bindingsOf = (actions: ReadonlyArray<PickerAction>) => [
  { key: "up", cmd: "picker.up" },
  { key: "down", cmd: "picker.down" },
  { key: "return", cmd: "picker.select" },
  { key: "kpenter", cmd: "picker.select" },
  ...actions.map((action, index) => ({ key: action.key, cmd: `picker.action.${index}` })),
  { key: "escape", cmd: "picker.close" },
];

type PickerState = ReturnType<typeof usePickerState>;

/** Up and down: they act with more than one row. */
const moveCommands = (state: PickerState): Command[] => {
  const canMove = () => state.rows().length > 1;

  return [
    {
      name: "picker.up",
      title: "Previous row",
      enabled: canMove,
      run: () => {
        state.move(-1);
      },
    },
    {
      name: "picker.down",
      title: "Next row",
      enabled: canMove,
      run: () => {
        state.move(1);
      },
    },
  ];
};

/** What `action` is called for `row`; nothing while no row is selected. */
const labelOf = (action: PickerAction, row: PickerRow | undefined) => {
  if (Predicate.isString(action.label)) return action.label;

  return row === undefined ? "" : action.label(row);
};

/**
 * Enter and each action: they act on the selected row, so only while one is. Enter has no hint;
 * every user expects it.
 */
const rowCommands = (props: PickerProps, state: PickerState, close: () => void): Command[] => {
  const hasRow = () => state.selected() !== undefined;

  const onSelected = (action: (row: PickerRow) => void, keepsOpen = false) => {
    const row = state.selected();
    if (row === undefined) return;
    if (!keepsOpen) close();
    action(row);
  };

  return [
    {
      name: "picker.select",
      title: "Select",
      enabled: hasRow,
      run: () => {
        onSelected(props.onSelect);
      },
    },
    ...props.actions.map((action, index) => ({
      name: `picker.action.${index}`,
      title: labelOf(action, state.selected()),
      hint: { label: labelOf(action, state.selected()) },
      enabled: hasRow,
      run: () => {
        onSelected(action.run, action.keepsOpen);
      },
    })),
  ];
};

/** Above the dialog stack's own `escape`; active while the picker's input has focus. */
const usePickerKeys = (
  props: PickerProps,
  state: PickerState,
  input: () => InputRenderable | undefined,
  close: () => void,
) => {
  const closeCommand: Command = {
    name: "picker.close",
    title: "Close",
    run: () => {
      close();
      props.onClose?.();
    },
  };

  useBindings(() => ({
    target: input,
    priority: 1,
    commands: [...moveCommands(state), ...rowCommands(props, state, close), closeCommand].map(
      keymapCommand,
    ),
    bindings: bindingsOf(props.actions),
  }));
};

export function Picker(props: PickerProps & { readonly close: () => void }) {
  const color = useColor();
  const state = usePickerState(props);
  const hints = useHints();
  let list: ScrollBoxRenderable | undefined;
  let input: InputRenderable | undefined;

  usePickerKeys(props, state, () => input, props.close);

  createEffect(() => {
    const row = state.selected();
    if (row !== undefined) list?.scrollChildIntoView(rowId(row.id));
  });

  return (
    <Dialog title={props.title} hints={hints()}>
      <box flexDirection="row" marginBottom={1}>
        <text flexShrink={0} fg={color("text.accent")} attributes={TextAttributes.BOLD}>
          {"> "}
        </text>
        <input
          ref={(made) => {
            input = made;
          }}
          focused
          flexGrow={1}
          placeholder={props.placeholder}
          placeholderColor={color("text.ghost")}
          textColor={color("text.base")}
          backgroundColor={color("surface.overlay")}
          onInput={state.search}
        />
      </box>
      <Show
        when={state.items().length > 0}
        fallback={
          <text fg={color("text.faint")}>{state.query() === "" ? props.empty : "No matches"}</text>
        }
      >
        <scrollbox
          ref={(made) => {
            list = made;
          }}
          height={Math.min(linesOf(state.items()), LIST_ROWS)}
          scrollbarOptions={{ visible: false }}
        >
          <For each={state.items()}>
            {(item) => <ItemView item={item} selected={state.selected()?.id} />}
          </For>
        </scrollbox>
      </Show>
    </Dialog>
  );
}
