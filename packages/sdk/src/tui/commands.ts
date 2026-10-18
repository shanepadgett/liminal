/**
 * Commands plugins' UI parts register: run by a key, by `/name` in the composer, or from the
 * command palette. Each is a named keymap command; the keymap decides which are reachable and which
 * keys run them.
 */

import type { KeyEvent, Renderable } from "@opentui/core";
import type { CommandContext, Keymap } from "@opentui/keymap";
import { formatCommandBindings } from "@opentui/keymap/extras";
import { Context, Effect, Option, Schema, type Scope } from "effect";
import { type Accessor, createSignal } from "solid-js";

/** The TUI's keymap. */
export type TuiKeymap = Keymap<Renderable, KeyEvent>;

/** How a command is typed in the composer: `/name`, or one of its aliases. */
export interface Slash {
  readonly name: string;
  readonly aliases?: ReadonlyArray<string>;
  /** The text after the name goes to the command instead of the model. */
  readonly arguments?: true;
}

export interface Command {
  /** The keymap name, such as `reload.now`. */
  readonly name: string;
  /** What the palette and the slash menu show. */
  readonly title: string;
  readonly desc?: string;
  /** The palette section it sits in. */
  readonly category?: string;
  readonly slash?: Slash;
  /** Listed in the command palette. */
  readonly palette?: true;
  /** Runs with the text typed after its slash name; empty from a key or the palette. */
  readonly run: (args: string) => void;
}

/** A key that runs a command, in the keymap's key syntax such as `ctrl+r`. */
export interface CommandKey {
  readonly key: string;
  readonly cmd: string;
}

/** A reachable command and the keys that run it, joined for display. */
export interface ListedCommand {
  readonly command: Command;
  readonly keys: string;
}

export interface TuiCommandsService {
  /** Adds `commands` and `keys` until the caller's Scope closes. */
  readonly register: (
    commands: ReadonlyArray<Command>,
    keys?: ReadonlyArray<CommandKey>,
  ) => Effect.Effect<void, never, Scope.Scope>;
  /** Runs the reachable command `name` with `args`. */
  readonly run: (name: string, args: string) => void;
  /** The reachable commands with their keys, current as the keymap changes. */
  readonly listed: Accessor<ReadonlyArray<ListedCommand>>;
}

/** The registered commands; every UI part's setup can read it. */
export class TuiCommands extends Context.Service<TuiCommands, TuiCommandsService>()(
  "liminal/sdk/TuiCommands",
) {}

/** What `run` hands the keymap, so the command reads its slash arguments. */
const Payload = Schema.Struct({ args: Schema.String });

/** The slash arguments, or none when a key or the palette ran the command. */
const argsOf = (context: CommandContext<Renderable, KeyEvent>) =>
  Schema.decodeUnknownOption(Payload)(context.payload).pipe(
    Option.match({ onNone: () => "", onSome: (payload) => payload.args }),
  );

/** The keymap's form of `command`: its name, metadata and run. */
const keymapCommand = (command: Command) => ({
  name: command.name,
  title: command.title,
  desc: command.desc,
  category: command.category,
  run: (context: CommandContext<Renderable, KeyEvent>) => {
    command.run(argsOf(context));
  },
});

/** The commands service over `keymap`, for as long as the caller's Scope is open. */
export const makeTuiCommands = Effect.fn("makeTuiCommands")(function* (keymap: TuiKeymap) {
  const registry = new Map<string, Command>();
  const [version, setVersion] = createSignal(0);

  yield* Effect.acquireRelease(
    Effect.sync(() => keymap.on("state", () => setVersion((last) => last + 1))),
    (off) => Effect.sync(off),
  );

  const register = (commands: ReadonlyArray<Command>, keys: ReadonlyArray<CommandKey> = []) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        for (const command of commands) registry.set(command.name, command);

        return keymap.registerLayer({
          commands: commands.map(keymapCommand),
          bindings: keys.map(({ key, cmd }) => ({ key, cmd })),
        });
      }),
      (dispose) =>
        Effect.sync(() => {
          dispose();

          for (const command of commands)
            if (registry.get(command.name) === command) registry.delete(command.name);
        }),
    ).pipe(Effect.asVoid);

  const listed = () => {
    version();

    return keymap.getCommandEntries({ visibility: "reachable" }).flatMap((entry) => {
      const command = registry.get(entry.command.name);

      return command === undefined
        ? []
        : [{ command, keys: formatCommandBindings(entry.bindings) ?? "" }];
    });
  };

  const service: TuiCommandsService = {
    register,
    run: (name, args) => {
      keymap.runCommand(name, { payload: Payload.make({ args }) });
    },
    listed,
  };

  return service;
});

/** The command typed as `/word`, by its slash name or an alias. */
export const slashCommand = (listed: ReadonlyArray<ListedCommand>, word: string) =>
  listed.find(
    ({ command }) =>
      command.slash !== undefined
      && (command.slash.name === word || (command.slash.aliases ?? []).includes(word)),
  )?.command;
