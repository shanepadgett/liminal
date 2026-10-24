/**
 * Slash's `tui` entry: the `/` draft trigger and typed commands. Typed as the draft's first
 * character, `/` lists the commands reachable now that have a slash name, read each time the menu
 * opens, each with the text it takes dimmed beside it: `[hint]` optional, `<hint>` required. Enter
 * completes the name and sends the draft as typed; tab completes the name, with a space after it
 * when the command takes text. A draft sent as a reachable command's `/name` and more text runs the
 * command with that text instead of sending it. A blocked command does not run: the draft gets back
 * `/name ` and any text after it, and the menu stays closed.
 */
import type { TextareaRenderable } from "@opentui/core";
import { Effect, Layer, Option } from "effect";
import fuzzysort from "fuzzysort";

import {
  ChatScreen,
  ChatSend,
  type DraftRow,
  type DraftToken,
  DraftTriggers,
  type OpenTrigger,
  replaceToken,
} from "@shanepadgett/liminal-chat/tui";
import { writtenOf } from "@shanepadgett/liminal-chat/view";
import { definePlugin } from "@shanepadgett/liminal-core";
import {
  type CommandArgument,
  Keymap,
  type ListedCommand,
  slashCommands,
} from "@shanepadgett/liminal-tui";

/** The text a command takes, as the menu shows it. */
const argumentOf = (argument: CommandArgument) =>
  argument.kind === "optional" ? `[${argument.hint}]` : `<${argument.hint}>`;

/** A command as a menu row: `/name` and the text it takes, its title beside them. */
const rowOf = (command: ListedCommand, slash: string, matches: ReadonlyArray<number>): DraftRow => {
  const row = { id: command.name, label: `/${slash}`, detail: command.title, matches };

  return command.argument === undefined ? row : { ...row, suffix: argumentOf(command.argument) };
};

/** Each slash name and alias of `commands`, with its command. */
const namesOf = (commands: ReadonlyArray<ListedCommand>) =>
  commands.flatMap((command) =>
    command.slash === undefined
      ? []
      : [command.slash.name, ...(command.slash.aliases ?? [])].map((name) => ({ command, name })),
  );

/** Each slash name and alias; every one shows with nothing typed, the matches in score order after. */
const rank = (commands: ReadonlyArray<ListedCommand>, query: string) => {
  const names = namesOf(commands);

  if (query === "") return names.map(({ command, name }) => rowOf(command, name, []));

  return fuzzysort.go(query, names, { key: "name" }).map((result) =>
    rowOf(
      result.obj.command,
      result.obj.name,
      result.indexes.map((at) => at + 1),
    ),
  );
};

/** `/name` and the text after it, at the start of a sent draft. */
const TYPED = /^\/(\S+)(?:\s+([\s\S]*))?$/u;

/** A draft that names a reachable command. */
interface Typed {
  /** The command's keymap name. */
  readonly name: string;
  /** The slash name or alias as typed. */
  readonly slash: string;
  /** The text after it, trimmed. */
  readonly rest: string;
  /** The whole draft. */
  readonly sent: string;
}

/** The reachable command `text` names, and the text after its name. */
const typedCommand = (commands: ReadonlyArray<ListedCommand>, text: string) =>
  Option.flatMap(Option.fromNullishOr(TYPED.exec(text)), ([, slash = "", rest]) =>
    Option.map(
      Option.fromNullishOr(namesOf(commands).find(({ name }) => name === slash)),
      ({ command }): Typed => ({ name: command.name, slash, rest: rest?.trim() ?? "", sent: text }),
    ),
  );

const make = Effect.gen(function* () {
  const keymap = yield* Keymap;
  const triggers = yield* DraftTriggers;
  const chat = yield* ChatScreen;

  /** Runs the typed command; blocked, it puts `/name ` and any text after it back in the draft. */
  const runTyped = (typed: Typed) => {
    const result = keymap.runCommand(typed.name, { payload: typed.rest });
    if (result.ok || result.reason !== "rejected") return;

    chat.draft.insert(typed.rest === "" ? `/${typed.slash} ` : typed.sent);
  };

  /** Completes the row's name, then sends the draft as if it were typed. */
  const runFromMenu =
    (commands: ReadonlyArray<ListedCommand>) =>
    (row: DraftRow, draft: TextareaRenderable, token: DraftToken) => {
      replaceToken(draft, token, row.label);

      const typed = typedCommand(commands, draft.plainText);
      if (Option.isNone(typed)) return;

      draft.clear();
      runTyped(typed.value);
    };

  const open = Effect.sync((): OpenTrigger => {
    const commands = slashCommands(keymap);

    return {
      rows: (query) => rank(commands, query),
      empty: "No commands match",
      keys: [
        { key: "return", title: "Run", run: runFromMenu(commands) },
        {
          key: "tab",
          title: "Complete",
          hint: "complete",
          run: (row, draft, token) => {
            replaceToken(draft, token, row.suffix === undefined ? row.label : `${row.label} `);
          },
        },
      ],
    };
  });

  yield* triggers.add({ char: "/", where: "draft-start", open });

  yield* (yield* ChatSend).wrap((request, next) =>
    Option.match(
      Option.flatMap(writtenOf(request.input), ({ text }) =>
        typedCommand(slashCommands(keymap), text),
      ),
      {
        onNone: () => next(request),
        onSome: (typed) =>
          Effect.sync(() => {
            runTyped(typed);
          }),
      },
    ),
  );
});

export default definePlugin({
  name: "slash-tui",
  provides: [],
  requires: [Keymap, DraftTriggers, ChatScreen, ChatSend],
  layer: Layer.effectDiscard(make),
});
