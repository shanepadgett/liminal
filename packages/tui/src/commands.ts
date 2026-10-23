/**
 * Commands: named keymap commands a key, a `/name` in the draft or the palette runs. Each carries
 * what lists show: a title, a category, a slash name and a hint beside its key. A command that
 * cannot act now is disabled, so it neither runs nor shows: its key passes on to the next layer.
 * The keymap decides which commands are reachable now and which keys run them.
 */
import type { KeyEvent, Renderable } from "@opentui/core";
import type { Layer, Keymap as OpenTuiKeymap } from "@opentui/keymap";
import { formatCommandBindings, formatKeySequence } from "@opentui/keymap/extras";
import { reactiveMatcherFromSignal, useKeymapSelector } from "@opentui/keymap/solid";
import { Context, Effect, Option, Predicate, Schema } from "effect";
import type { Accessor } from "solid-js";

import type { Hint } from "./kit/hint-layout.ts";

/** The TUI's keymap; `root.tsx` draws with the same one. */
export class Keymap extends Context.Service<Keymap, OpenTuiKeymap<Renderable, KeyEvent>>()(
  "tui/Keymap",
) {}

/** How a command is typed in the draft: `/name`, or one of its aliases. */
export interface Slash {
  readonly name: string;
  readonly aliases?: ReadonlyArray<string>;
}

/** What a hint line shows beside a command's key. */
export interface CommandHint {
  readonly label: string;
  /** Shown in place of the key, for keys shown together such as `↑↓`. */
  readonly keys?: string;
  /** Placed before the other hints, so it stays when a line cannot fit them all. */
  readonly important?: boolean;
}

export interface Command {
  /** The keymap name, such as `stash.save`. */
  readonly name: string;
  /** What the palette and the `/` menu show. */
  readonly title: string;
  /** The palette section it sits in. */
  readonly category?: string;
  readonly slash?: Slash;
  readonly hint?: CommandHint;
  /** While false the command neither runs nor shows its hint; always on without one. */
  readonly enabled?: Accessor<boolean>;
  readonly run: () => void;
}

/** A key that runs a command, in the keymap's key syntax such as `ctrl+s`. */
export interface CommandKey {
  readonly key: string;
  readonly cmd: string;
}

/** The keymap's form of `command`; the keymap writes to what it is given, so it gets a copy. */
export const keymapCommand = (command: Command) => ({
  name: command.name,
  title: command.title,
  category: command.category,
  slash: command.slash,
  hint: command.hint,
  enabled: command.enabled === undefined ? true : reactiveMatcherFromSignal(command.enabled),
  run: () => {
    command.run();
  },
});

/** A keymap layer of `commands` and `keys`; with `target`, active only while focus is within it. */
export const commandLayer = (
  commands: ReadonlyArray<Command>,
  keys: ReadonlyArray<CommandKey>,
  target?: Renderable,
): Layer<Renderable, KeyEvent> => {
  const layer = {
    commands: commands.map(keymapCommand),
    bindings: keys.map(({ key, cmd }) => ({ key, cmd })),
  };

  return target === undefined ? layer : { ...layer, target, targetMode: "focus-within" };
};

/** Adds `commands` and `keys` to the keymap app-wide until the caller's scope closes. */
export const registerCommands = Effect.fn("registerCommands")(function* (
  commands: ReadonlyArray<Command>,
  keys: ReadonlyArray<CommandKey> = [],
) {
  const keymap = yield* Keymap;

  yield* Effect.acquireRelease(
    Effect.sync(() => keymap.registerLayer(commandLayer(commands, keys))),
    (unregister) => Effect.sync(unregister),
  );
});

/** What lists read back from a reachable command; commands with no title are left out. */
const Listed = Schema.Struct({
  name: Schema.String,
  title: Schema.String,
  category: Schema.optional(Schema.String),
  slash: Schema.optional(
    Schema.Struct({ name: Schema.String, aliases: Schema.optional(Schema.Array(Schema.String)) }),
  ),
});

const decodeListed = Schema.decodeUnknownOption(Listed);

/** A command reachable now, and the keys that run it joined for display; empty with none. */
export type ListedCommand = typeof Listed.Type & { readonly keys: string };

/** Every command reachable now, in layer order. */
export const listCommands = (
  keymap: OpenTuiKeymap<Renderable, KeyEvent>,
): ReadonlyArray<ListedCommand> =>
  keymap
    .getCommandEntries({ visibility: "reachable" })
    .flatMap((entry) =>
      Option.match(decodeListed(entry.command), {
        onNone: () => [],
        onSome: (command) => [{ ...command, keys: formatCommandBindings(entry.bindings) ?? "" }],
      }),
    );

/** The reachable commands typed as `/name`. */
export const slashCommands = (keymap: OpenTuiKeymap<Renderable, KeyEvent>) =>
  listCommands(keymap).filter((command) => command.slash !== undefined);

const decodeHint = Schema.decodeUnknownOption(
  Schema.Struct({
    label: Schema.String,
    keys: Schema.optional(Schema.String),
    important: Schema.optional(Schema.Boolean),
  }),
);

/** Key names as hints spell them. */
const keyNameAliases = { return: "enter", escape: "esc" };

/**
 * A hint for each key that runs a command now and whose command has one: important hints first,
 * then the rest, each in the keymap's order: higher-priority layers first. A command on several
 * keys, such as `return` and `kpenter`, shows only by its first key, and not at all while another
 * command holds that key.
 */
export const activeHints = (keymap: OpenTuiKeymap<Renderable, KeyEvent>): ReadonlyArray<Hint> => {
  const active = keymap.getActiveKeys({ includeMetadata: true });
  const commands = active.flatMap((key) => (Predicate.isString(key.command) ? [key.command] : []));
  const bindings = keymap.getCommandBindings({ visibility: "reachable", commands });

  const decoded = active.flatMap((key) => {
    const first = Predicate.isString(key.command) ? bindings.get(key.command)?.[0] : undefined;

    const isFirstKey =
      first !== undefined && formatKeySequence(first.sequence) === formatKeySequence([key]);

    if (!isFirstKey) return [];

    return Option.match(decodeHint(key.commandAttrs?.["hint"]), {
      onNone: () => [],
      onSome: (hint) => [
        {
          important: hint.important === true,
          hint: {
            keys: hint.keys ?? formatKeySequence([key], { keyNameAliases }),
            label: hint.label,
          },
        },
      ],
    });
  });

  return [
    ...decoded.filter((each) => each.important),
    ...decoded.filter((each) => !each.important),
  ].map((each) => each.hint);
};

/** The hints of the keys that act now; follows the keymap as focus and commands change. */
export const useHints = (): Accessor<ReadonlyArray<Hint>> => useKeymapSelector(activeHints);
