/**
 * The palette's `tui` entry: `ctrl+p` lists the commands reachable now that have a category, under
 * their categories, and enter runs the pick. It reads them as it opens, while the screen's focus is
 * still where the user left it; the picker closes before the pick runs, so focus is back there.
 */
import { Effect, Layer } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import {
  Dialogs,
  kit,
  Keymap,
  type ListedCommand,
  listCommands,
  makeEntryRun,
  openPicker,
  Pickers,
  registerCommands,
} from "@shanepadgett/liminal-tui";

/** A command's keys, else its `/name`. */
const detailOf = (command: ListedCommand) => {
  if (command.keys !== "") return command.keys;

  return command.slash === undefined ? undefined : `/${command.slash.name}`;
};

/** A command as a row under `section`. */
const rowOf = (command: ListedCommand, section: string): kit.PickerRow => {
  const detail = detailOf(command);

  return detail === undefined
    ? { id: command.name, title: command.title, section }
    : { id: command.name, title: command.title, detail, section };
};

/** The commands with a category, each category's together in the order it first shows. */
const rowsOf = (commands: ReadonlyArray<ListedCommand>): ReadonlyArray<kit.PickerRow> => {
  const categories = [
    ...new Set(
      commands.flatMap((command) => (command.category === undefined ? [] : [command.category])),
    ),
  ];

  return categories.flatMap((category) =>
    commands.flatMap((command) =>
      command.category === category ? [rowOf(command, category)] : [],
    ),
  );
};

const make = Effect.gen(function* () {
  const keymap = yield* Keymap;
  const dialogs = yield* Dialogs;
  const run = yield* makeEntryRun("The palette failed.");

  const open = () => {
    const rows = rowsOf(listCommands(keymap));

    run(
      openPicker({
        name: "palette/commands",
        title: "Commands",
        placeholder: "Search commands",
        empty: "No commands",
        rows: () => rows,
        actions: [],
        onSelect: (row) => {
          keymap.runCommand(row.id);
        },
      }),
    );
  };

  yield* registerCommands(
    [
      {
        name: "palette.open",
        title: "Commands",
        hint: { label: "commands" },
        enabled: () => dialogs.top() === undefined,
        run: open,
      },
    ],
    [{ key: "ctrl+p", cmd: "palette.open" }],
  );
});

export default definePlugin({
  name: "palette-tui",
  provides: [],
  requires: [Host, Keymap, Dialogs, Pickers],
  layer: Layer.effectDiscard(make),
});
