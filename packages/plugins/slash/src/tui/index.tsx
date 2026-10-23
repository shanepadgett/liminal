/**
 * Slash's `tui` entry: the `/` draft trigger. Typed as the draft's first character, it lists the
 * commands reachable now that have a slash name, read each time the menu opens. Enter clears the
 * draft and runs the command; tab completes its name and keeps the menu open.
 */
import { Effect, Layer } from "effect";
import fuzzysort from "fuzzysort";

import {
  type DraftRow,
  DraftTriggers,
  type OpenTrigger,
  replaceToken,
} from "@shanepadgett/liminal-chat/tui";
import { definePlugin } from "@shanepadgett/liminal-core";
import { Keymap, type ListedCommand, slashCommands } from "@shanepadgett/liminal-tui";

/** A command as a menu row: `/name`, its title beside it. */
const rowOf = (
  command: ListedCommand,
  slash: string,
  matches: ReadonlyArray<number>,
): DraftRow => ({ id: command.name, label: `/${slash}`, detail: command.title, matches });

/** Each slash name and alias; every one shows with nothing typed, the matches in score order after. */
const rank = (commands: ReadonlyArray<ListedCommand>, query: string) => {
  const names = commands.flatMap((command) =>
    command.slash === undefined
      ? []
      : [command.slash.name, ...(command.slash.aliases ?? [])].map((name) => ({ command, name })),
  );

  if (query === "") return names.map(({ command, name }) => rowOf(command, name, []));

  return fuzzysort.go(query, names, { key: "name" }).map((result) =>
    rowOf(
      result.obj.command,
      result.obj.name,
      result.indexes.map((at) => at + 1),
    ),
  );
};

const make = Effect.gen(function* () {
  const keymap = yield* Keymap;
  const triggers = yield* DraftTriggers;

  const open = Effect.sync((): OpenTrigger => {
    const commands = slashCommands(keymap);

    return {
      rows: (query) => rank(commands, query),
      empty: "No commands match",
      keys: [
        {
          key: "return",
          label: "run",
          run: (row, draft) => {
            draft.clear();
            keymap.runCommand(row.id);
          },
        },
        {
          key: "tab",
          label: "complete",
          run: (row, draft, token) => {
            replaceToken(draft, token, row.label);
          },
        },
      ],
    };
  });

  yield* triggers.add({ char: "/", where: "draft-start", open });
});

export default definePlugin({
  name: "slash-tui",
  provides: [],
  requires: [Keymap, DraftTriggers],
  layer: Layer.effectDiscard(make),
});
