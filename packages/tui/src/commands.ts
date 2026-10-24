/**
 * Commands: named keymap commands a key, a `/name` in the draft or the palette runs. Each carries
 * what lists show: a title, a category, a slash name and a hint beside its key. A command that
 * cannot act now is disabled, so it neither runs nor shows: its key passes on to the next layer. A
 * command that shows but cannot run now is blocked: running it posts the reason as a warning. A
 * command may take text after its slash name; one that requires text is blocked without it. The
 * keymap decides which commands are reachable now and which keys run them.
 */
import type { KeyEvent, Renderable } from "@opentui/core";
import type { Layer, Keymap as OpenTuiKeymap } from "@opentui/keymap";
import { formatCommandBindings, formatKeySequence } from "@opentui/keymap/extras";
import { reactiveMatcherFromSignal, useKeymapSelector } from "@opentui/keymap/solid";
import { useRenderer } from "@opentui/solid";
import { Context, Effect, Option, Predicate, Schema } from "effect";
import type { Accessor } from "solid-js";

import type { Hint } from "./kit/hint-layout.ts";
import { type Notification, Notifications } from "./notifications.ts";

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

/** The text a command takes after its slash name, such as `/commit` and how to group the commits. */
export interface CommandArgument {
  /** `optional` runs without text; `required` is blocked without it. */
  readonly kind: "optional" | "required";
  /** What the text is, a word or two such as `guidance`; the `/` menu shows it dimmed. */
  readonly hint: string;
}

/** Why a command cannot run now, shown as a warning when it is run anyway. */
export interface Blocked {
  readonly title: string;
  readonly message?: string;
}

export interface Command {
  /** The keymap name, such as `stash.save`. */
  readonly name: string;
  /** What the palette and the `/` menu show. */
  readonly title: string;
  /** The palette section it sits in. */
  readonly category?: string;
  readonly slash?: Slash;
  /** The text it takes after its slash name; none without one. */
  readonly argument?: CommandArgument;
  readonly hint?: CommandHint;
  /** While false the command neither runs nor shows its hint; always on without one. */
  readonly enabled?: Accessor<boolean>;
  /**
   * While it gives a reason, the command shows but does not run. Registered with
   * `registerCommands`, running it then posts the reason as a warning.
   */
  readonly blocked?: Accessor<Blocked | undefined>;
  /** `text` is what followed the slash name in the draft; empty from a key, a menu or the palette. */
  readonly run: (text: string) => void;
}

/** A key that runs a command, in the keymap's key syntax such as `ctrl+s`. */
export interface CommandKey {
  readonly key: string;
  readonly cmd: string;
}

type Post = (notification: Notification) => void;

const UNANNOUNCED: Post = () => {};

/** Why `command` cannot run with `text` now: its own reason first, then missing required text. */
const blockedOf = (command: Command, text: string): Blocked | undefined => {
  const blocked = command.blocked?.();

  if (blocked !== undefined || command.argument?.kind !== "required" || text.trim() !== "") {
    return blocked;
  }

  const name = command.slash === undefined ? command.title : `/${command.slash.name}`;

  return { title: `${name} needs text`, message: `Write the ${command.argument.hint} after it.` };
};

/**
 * The keymap's form of `command`, posting through `post` when it is blocked; the keymap writes to
 * what it is given, so it gets a copy. A blocked run is rejected, so `runCommand` reports it.
 */
const keymapCommandPosting = (command: Command, post: Post) => ({
  name: command.name,
  title: command.title,
  category: command.category,
  slash: command.slash,
  argument: command.argument,
  hint: command.hint,
  enabled: command.enabled === undefined ? true : reactiveMatcherFromSignal(command.enabled),
  run: (ctx: { readonly payload: unknown }) => {
    const text = Predicate.isString(ctx.payload) ? ctx.payload : "";
    const blocked = blockedOf(command, text);

    if (blocked !== undefined) {
      post({ kind: "warning", ...blocked });

      return false;
    }

    command.run(text);

    return true;
  },
});

/**
 * The keymap's form of `command`, for `useBindings` in a component; a blocked run is rejected
 * without a warning.
 */
export const keymapCommand = (command: Command) => keymapCommandPosting(command, UNANNOUNCED);

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
  const notifications = yield* Notifications;

  const layer = {
    commands: commands.map((command) => keymapCommandPosting(command, notifications.post)),
    bindings: keys.map(({ key, cmd }) => ({ key, cmd })),
  };

  yield* Effect.acquireRelease(
    Effect.sync(() => keymap.registerLayer(layer)),
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
  argument: Schema.optional(
    Schema.Struct({ kind: Schema.Literals(["optional", "required"]), hint: Schema.String }),
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
 * command holds that key. With `only`, just the hints of the commands it names.
 */
export const activeHints = (
  keymap: OpenTuiKeymap<Renderable, KeyEvent>,
  only?: ReadonlySet<string>,
): ReadonlyArray<Hint> => {
  const all = keymap.getActiveKeys({ includeMetadata: true });

  const active =
    only === undefined
      ? all
      : all.filter((key) => Predicate.isString(key.command) && only.has(key.command));

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
export const useHints = (): Accessor<ReadonlyArray<Hint>> =>
  useKeymapSelector((keymap) => activeHints(keymap));

/** Whether focus sits on `root` or inside it. */
const isWithin = (focused: Renderable | null, root: Renderable | undefined): boolean => {
  if (focused === null || root === undefined) return false;
  if (focused === root) return true;

  return isWithin(focused.parent, root);
};

/**
 * `useHints` while focus sits on `root` or inside it, and none otherwise, so a dialog above shows
 * only its own keys.
 */
export const useHintsWithin = (
  root: () => Renderable | undefined,
): Accessor<ReadonlyArray<Hint>> => {
  const renderer = useRenderer();

  return useKeymapSelector((keymap) =>
    isWithin(renderer.currentFocusedRenderable, root()) ? activeHints(keymap) : [],
  );
};
