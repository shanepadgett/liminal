/**
 * The `/references` dialog: every clone, the session's attached ones marked. Space marks, enter
 * attaches the marked ones; other keys clone, pull, switch branch, open and delete, each noting its
 * progress or failure on its row.
 */

import { useBindings } from "@opentui/keymap/solid";
import { For, Show } from "solid-js";

import { DialogFrame, enterKeys, type Hint, moveKeys, useColor } from "@liminal/sdk/tui";

import type { Panel, PanelRow } from "./panel.ts";

/** What the dialog's keys do; each acts on the panel. */
export interface DialogActions {
  /** Attaches the marked clones to the session. */
  readonly attach: () => void;
  readonly clone: () => void;
  readonly pullAll: () => void;
  readonly branch: (name: string) => void;
  readonly open: (name: string) => void;
  readonly remove: (name: string) => void;
}

const HINTS: readonly Hint[] = [
  ["space", "mark"],
  ["enter", "attach"],
  ["^n", "clone"],
  ["^u", "pull"],
  ["^r", "branch"],
  ["^o", "open"],
  ["^x", "delete"],
];

/** The highlighted clone's name, when it is cloned. */
const highlighted = (panel: Panel, run: (name: string) => void) => () => {
  const row = panel.rows()[panel.selected()];
  if (row?.isCloned === true) run(row.reference.name);
};

const keysOf = (panel: Panel, actions: DialogActions, close: () => void) => {
  const moves = moveKeys("references", { count: () => panel.rows().length, select: panel.select });

  const commands = [
    ...moves.commands,
    { name: "references.mark", run: highlighted(panel, panel.toggle) },
    {
      name: "references.attach",
      run: () => {
        close();
        actions.attach();
      },
    },
    { name: "references.clone", run: actions.clone },
    { name: "references.pull", run: actions.pullAll },
    { name: "references.branch", run: highlighted(panel, actions.branch) },
    { name: "references.open", run: highlighted(panel, actions.open) },
    { name: "references.remove", run: highlighted(panel, actions.remove) },
  ];

  return {
    commands,
    bindings: [
      ...moves.bindings,
      ...enterKeys("references.attach"),
      { key: "space", cmd: "references.mark" },
      { key: "ctrl+n", cmd: "references.clone" },
      { key: "ctrl+u", cmd: "references.pull" },
      { key: "ctrl+r", cmd: "references.branch" },
      { key: "ctrl+o", cmd: "references.open" },
      { key: "ctrl+x", cmd: "references.remove" },
    ],
  };
};

function Row(props: {
  readonly panel: Panel;
  readonly row: PanelRow;
  readonly isSelected: boolean;
}) {
  const color = useColor();
  const name = () => props.row.reference.name;
  const isMarked = () => props.panel.marked().has(name());
  const note = () => props.panel.noteOf(name()) ?? props.row.reference.branch ?? "";
  const faint = () => color(props.isSelected ? "text.muted" : "text.faint");

  return (
    <box
      flexDirection="row"
      height={1}
      marginX={-1}
      paddingX={1}
      gap={1}
      backgroundColor={props.isSelected ? color("surface.selected") : "transparent"}
    >
      <text flexShrink={0} fg={color(isMarked() ? "text.accent" : "text.faint")}>
        {isMarked() ? "●" : "○"}
      </text>
      <text
        flexShrink={0}
        wrapMode="none"
        fg={color(props.isSelected ? "text.base" : "text.muted")}
      >
        {name()}
      </text>
      <text flexGrow={1} flexShrink={1} wrapMode="none" fg={faint()}>
        {props.row.reference.description ?? ""}
      </text>
      <text
        flexShrink={0}
        wrapMode="none"
        fg={note().startsWith("!") ? color("feedback.warning") : faint()}
      >
        {note()}
      </text>
    </box>
  );
}

export function ReferencesDialog(props: {
  readonly panel: Panel;
  readonly actions: DialogActions;
  readonly close: () => void;
}) {
  const color = useColor();

  useBindings(() => keysOf(props.panel, props.actions, props.close));

  return (
    <DialogFrame title="References" hints={HINTS} close={props.close}>
      <Show
        when={props.panel.rows().length > 0}
        fallback={
          <text fg={color("text.muted")}>No references. Ctrl+n clones one from a git URL.</text>
        }
      >
        <box flexDirection="column">
          <For each={props.panel.rows()}>
            {(row, index) => (
              <Row panel={props.panel} row={row} isSelected={index() === props.panel.selected()} />
            )}
          </For>
        </box>
      </Show>
    </DialogFrame>
  );
}
