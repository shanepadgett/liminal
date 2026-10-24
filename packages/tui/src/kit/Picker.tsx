/**
 * A dialog that filters a list as the user types. Rows sit under their section titles; a query
 * keeps the rows that match, best first within each section, and marks the matched letters. It
 * keeps its own query and selection: up and down move, enter picks, esc closes, and each action's
 * key runs it on the selected row. A pick or action that confirms asks in the footer first; typing
 * drops the question.
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
import { useConfirm } from "./Confirm.tsx";
import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";

export interface PickerRow {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly section?: string;
}

/** Asks in the footer before running: the question for the row, and what enter does, as `drop`. */
export interface PickerConfirm {
  readonly question: (row: PickerRow) => string;
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
  /** Whether it acts on `row`; its key and hint work only where it does. Every row without it. */
  readonly when?: (row: PickerRow) => boolean;
  readonly confirm?: PickerConfirm | undefined;
}

export interface PickerProps {
  readonly title: string;
  readonly placeholder: string;
  /** Shown when there are no rows at all. */
  readonly empty: string;
  readonly rows: Accessor<ReadonlyArray<PickerRow>>;
  /** The note on the right of a section title, such as `connected`; none when it answers nothing. */
  readonly sectionDetail?: ((section: string) => string | undefined) | undefined;
  /** The id of the row selected when it opens; the first row without it. */
  readonly initial?: string | undefined;
  readonly actions: ReadonlyArray<PickerAction>;
  readonly onSelect: (row: PickerRow) => void;
  /** Asks before a pick runs. */
  readonly confirmSelect?: PickerConfirm | undefined;
  /** The selection moved to `row`. */
  readonly onMove?: (row: PickerRow) => void;
  /** Closed with esc, without a pick. */
  readonly onClose?: () => void;
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
const sectioned = (found: ReadonlyArray<Found>): readonly Item[] =>
  found.flatMap((item, index): Item[] => {
    const { section } = item.row;
    const isFirst = section !== undefined && section !== found[index - 1]?.row.section;

    return isFirst ? [{ kind: "section", title: section, isSpaced: index > 0 }, item] : [item];
  });

/** The lines the items take, blank lines included. */
const linesOf = (items: readonly Item[]) =>
  items.length + items.filter((item) => item.kind === "section" && item.isSpaced).length;

/** The rows matching `query` in their sections, which keep their order; every row for none. */
const itemsOf = (rows: ReadonlyArray<PickerRow>, query: string): readonly Item[] => {
  if (query === "") return sectioned(rows.map((row) => ({ kind: "row", row, matches: [] })));

  const found = fuzzysort
    .go(query, rows, { key: "title" })
    .map((result): Found => ({ kind: "row", row: result.obj, matches: result.indexes }));

  const sections = [...new Set(rows.map((row) => row.section))];

  return sectioned(
    sections.flatMap((section) => found.filter((each) => each.row.section === section)),
  );
};

const rowId = (id: string) => `picker-row-${id}`;

function ItemView(props: {
  readonly item: Item;
  readonly selected: string | undefined;
  readonly sectionDetail: PickerProps["sectionDetail"];
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

/**
 * The query, the items it shows, the selected row and the question asked about it; a new query
 * selects the first match and drops the question.
 */
const usePickerState = (props: PickerProps) => {
  const confirm = useConfirm();
  const [query, setQuery] = createSignal("");
  const [chosen, setChosen] = createSignal(props.initial);
  const items = createMemo(() => itemsOf(props.rows(), query()));
  const rows = createMemo(() => items().flatMap((item) => (item.kind === "row" ? [item.row] : [])));
  const selected = createMemo(() => rows().find((row) => row.id === chosen()) ?? rows()[0]);

  /** Keys the input takes without changing it, such as `ctrl+d` on no row, keep the selection. */
  const search = (next: string) => {
    if (next === query()) return;
    confirm.cancel();
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

  return { query, items, rows, selected, search, move, confirm };
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

/** Up and down: they act with more than one row, and not while a question waits. */
const moveCommands = (state: PickerState): Command[] => {
  const canMove = () => state.rows().length > 1 && !state.confirm.isAsking();

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
 * Enter and each action: they act on the selected row, so only while one is and no question waits.
 * Enter has no hint; every user expects it.
 */
const rowCommands = (props: PickerProps, state: PickerState, close: () => void): Command[] => {
  const canAct = (action: PickerAction) => {
    const row = state.selected();

    return row !== undefined && !state.confirm.isAsking() && (action.when?.(row) ?? true);
  };

  /** Runs `action` on the selected row, or asks first when it confirms. */
  const onSelected = (action: PickerAction) => {
    const row = state.selected();
    if (row === undefined) return;

    const run = () => {
      if (action.keepsOpen !== true) close();
      action.run(row);
    };

    if (action.confirm === undefined) run();
    else state.confirm.ask({ question: action.confirm.question(row), run });
  };

  const select: PickerAction = {
    key: "return",
    label: "",
    run: props.onSelect,
    confirm: props.confirmSelect,
  };

  return [
    {
      name: "picker.select",
      title: "Select",
      enabled: () => canAct(select),
      run: () => {
        onSelected(select);
      },
    },
    ...props.actions.map((action, index) => ({
      name: `picker.action.${index}`,
      title: labelOf(action, state.selected()),
      hint: { label: labelOf(action, state.selected()) },
      enabled: () => canAct(action),
      run: () => {
        onSelected(action);
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
    <Dialog title={props.title} hints={hints()} confirming={state.confirm.confirming()}>
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
            {(item) => (
              <ItemView
                item={item}
                selected={state.selected()?.id}
                sectionDetail={props.sectionDetail}
              />
            )}
          </For>
        </scrollbox>
      </Show>
    </Dialog>
  );
}
