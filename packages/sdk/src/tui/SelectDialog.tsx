/**
 * A dialog that picks one option: a filter line, then the options that match it grouped by
 * category, the matched characters in the accent. Up and down move the highlight, enter picks it,
 * and the list scrolls to keep the highlight in view.
 */

import { type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { enterKeys } from "./commands.ts";
import { DialogFrame, type DialogProps } from "./dialogs.tsx";
import type { Hint } from "./Hints.tsx";
import { matchIndices, matchRuns } from "./match.ts";
import { useColor } from "./theme.ts";
import type { RoleColor } from "./tokens/roles.ts";

export interface SelectOption<V> {
  readonly title: string;
  readonly value: V;
  readonly description?: string;
  /** The section it sits in; options without one share an untitled first section. */
  readonly category?: string;
  /** The keys that run it, shown at the right. */
  readonly keys?: string;
  /**
   * A row that says something instead of naming a choice, such as a failure: it reads in the
   * warning color.
   */
  readonly tone?: "warning";
}

export interface SelectDialogProps<V> extends DialogProps {
  readonly title: string;
  readonly options: ReadonlyArray<SelectOption<V>>;
  /** Highlighted when the dialog opens; the first option when none. */
  readonly current?: V | undefined;
  /** Runs after the dialog closes. */
  readonly onSelect: (value: V) => void;
}

interface Row<V> {
  readonly option: SelectOption<V>;
  readonly matches: ReadonlySet<number>;
  readonly index: number;
}

interface Group<V> {
  readonly category: string;
  readonly rows: ReadonlyArray<Row<V>>;
}

/** The most list rows shown before the list scrolls. */
const MAX_LIST_ROWS = 16;

const HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "select"],
];

/** The options matching `query`, grouped by category in first-seen order, numbered in that order. */
const groupsOf = <V,>(options: ReadonlyArray<SelectOption<V>>, query: string) => {
  const byCategory = new Map<string, Array<Omit<Row<V>, "index">>>();

  for (const option of options) {
    const matches = matchIndices(query, option.title);
    if (matches === undefined) continue;
    const category = option.category ?? "";
    byCategory.set(category, [...(byCategory.get(category) ?? []), { option, matches }]);
  }

  let index = 0;

  return [...byCategory].map(([category, rows]): Group<V> => ({
    category,
    rows: rows.map((row) => ({ ...row, index: index++ })),
  }));
};

/** Section titles, the blank rows between sections, and the options. */
const rowCount = <V,>(groups: ReadonlyArray<Group<V>>) =>
  groups.reduce(
    (total, group, index) =>
      total + (index === 0 ? 0 : 1) + (group.category === "" ? 0 : 1) + group.rows.length,
    0,
  );

/**
 * The lines option `index` covers in the list, counted from its top. The first option of a section
 * also covers the section title, so revealing it shows the title.
 */
const spanOf = <V,>(groups: ReadonlyArray<Group<V>>, index: number) => {
  let line = 0;

  for (const [position, group] of groups.entries()) {
    if (position > 0) line += 1;
    const title = group.category === "" ? 0 : 1;
    const first = group.rows[0]?.index ?? 0;

    if (index < first + group.rows.length) {
      const row = line + title + index - first;

      return { top: index === first ? line : row, bottom: row + 1 };
    }

    line += title + group.rows.length;
  }

  return { top: 0, bottom: 0 };
};

function OptionRow<V>(props: {
  readonly color: RoleColor;
  readonly row: Row<V>;
  readonly isSelected: boolean;
}) {
  const fg = () => {
    if (props.row.option.tone === "warning") return props.color("feedback.warning");

    return props.color(props.isSelected ? "text.base" : "text.muted");
  };

  const faint = () => props.color(props.isSelected ? "text.muted" : "text.faint");

  return (
    <box
      flexDirection="row"
      height={1}
      marginX={-1}
      paddingX={1}
      gap={2}
      backgroundColor={props.isSelected ? props.color("surface.selected") : "transparent"}
    >
      <text flexShrink={0} wrapMode="none">
        <For each={matchRuns(props.row.option.title, props.row.matches)}>
          {(run) => (
            <span style={{ fg: run.matched ? props.color("text.accent") : fg() }}>{run.text}</span>
          )}
        </For>
      </text>
      <text flexGrow={1} flexShrink={1} wrapMode="none" fg={faint()}>
        {props.row.option.description ?? ""}
      </text>
      <Show when={props.row.option.keys}>
        {(keys) => (
          <text flexShrink={0} fg={faint()}>
            {keys()}
          </text>
        )}
      </Show>
    </box>
  );
}

function GroupRows<V>(props: {
  readonly color: RoleColor;
  readonly group: Group<V>;
  readonly selected: number;
}) {
  return (
    <box flexDirection="column">
      <Show when={props.group.category !== ""}>
        <text fg={props.color("text.heading")} attributes={TextAttributes.BOLD} wrapMode="none">
          {props.group.category}
        </text>
      </Show>
      <For each={props.group.rows}>
        {(row) => (
          <OptionRow color={props.color} row={row} isSelected={row.index === props.selected} />
        )}
      </For>
    </box>
  );
}

function FilterLine(props: { readonly onInput: (value: string) => void }) {
  const color = useColor();
  const surface = () => color("surface.raised");

  return (
    <box flexDirection="row" flexShrink={0}>
      <text flexShrink={0} fg={color("text.accent")}>
        {"› "}
      </text>
      <input
        focused
        flexGrow={1}
        placeholder="Type to filter"
        onInput={props.onInput}
        backgroundColor={surface()}
        focusedBackgroundColor={surface()}
        textColor={color("text.base")}
        focusedTextColor={color("text.base")}
        placeholderColor={color("text.ghost")}
        cursorColor={color("text.accent")}
      />
    </box>
  );
}

function OptionList<V>(props: {
  readonly groups: ReadonlyArray<Group<V>>;
  readonly selected: number;
}) {
  const color = useColor();
  let list: ScrollBoxRenderable | undefined;

  const reveal = () => {
    if (list === undefined) return;
    const span = spanOf(props.groups, props.selected);
    const height = list.viewport.height;

    if (span.top < list.scrollTop) list.scrollTop = span.top;
    else if (span.bottom > list.scrollTop + height) list.scrollTop = span.bottom - height;
  };

  createEffect(reveal);

  return (
    <scrollbox
      ref={(made: ScrollBoxRenderable) => {
        list = made;
        // The list cannot scroll until its height is known, so the first reveal waits for it.
        made.content.on("resize", reveal);
      }}
      height={Math.min(rowCount(props.groups), MAX_LIST_ROWS)}
      flexShrink={1}
      minHeight={0}
      scrollbarOptions={{ visible: false }}
    >
      <box flexDirection="column" gap={1}>
        <For each={props.groups}>
          {(group) => <GroupRows color={color} group={group} selected={props.selected} />}
        </For>
      </box>
    </scrollbox>
  );
}

/** Where the highlight starts: on `current`, else on the first option. */
const startOf = <V,>(options: ReadonlyArray<SelectOption<V>>, current: V | undefined) => {
  const rows = groupsOf(options, "").flatMap((group) => group.rows);

  return rows.find((row) => row.option.value === current)?.index ?? 0;
};

export function SelectDialog<V>(props: SelectDialogProps<V>) {
  const [query, setQuery] = createSignal("");
  const groups = createMemo(() => groupsOf(props.options, query()));
  const rows = () => groups().flatMap((group) => group.rows);
  const [selected, setSelected] = createSignal(startOf(props.options, props.current));

  const move = (by: number) => {
    const count = rows().length;
    if (count > 0) setSelected((index) => (index + by + count) % count);
  };

  const choose = () => {
    const row = rows()[selected()];
    if (row === undefined) return;
    props.close();
    props.onSelect(row.option.value);
  };

  useBindings(() => ({
    commands: [
      {
        name: "select.up",
        run: () => {
          move(-1);
        },
      },
      {
        name: "select.down",
        run: () => {
          move(1);
        },
      },
      { name: "select.choose", run: choose },
    ],
    bindings: [
      { key: "up", cmd: "select.up" },
      { key: "down", cmd: "select.down" },
      ...enterKeys("select.choose"),
    ],
  }));

  return (
    <DialogFrame title={props.title} hints={HINTS} close={props.close}>
      <FilterLine
        onInput={(value) => {
          setQuery(value);
          setSelected(0);
        }}
      />
      <OptionList groups={groups()} selected={selected()} />
    </DialogFrame>
  );
}
