/**
 * The chat screen as other plugins reach it: the session on screen, showing another or none, the
 * draft, and commands that act on the screen. Made with Solid signals in chat's `tui` layer; the
 * screen draws from the same ones, so a command from any plugin can change what shows.
 */
import type { TextareaRenderable } from "@opentui/core";
import { Context, Effect, type Scope } from "effect";
import { type Accessor, createSignal } from "solid-js";

import type { SessionId } from "@shanepadgett/liminal-session/contract";
import { type Command, type CommandKey, commandLayer, Keymap } from "@shanepadgett/liminal-tui";

export interface Draft {
  /** The draft's text as it is now, trimmed; follows each edit. */
  readonly text: Accessor<string>;
  /** Adds `text` after the draft, with a blank line between. */
  readonly insert: (text: string) => void;
  /** Puts `text` before the draft, with a blank line between. */
  readonly prepend: (text: string) => void;
  /** Clears the draft, only if it still holds `text`. */
  readonly clearIf: (text: string) => void;
}

export class ChatScreen extends Context.Service<
  ChatScreen,
  {
    /** The session on screen; undefined on the landing screen. */
    readonly session: Accessor<SessionId | undefined>;
    readonly show: (session: SessionId) => void;
    /** Back to the landing screen; nothing is saved until the next send. */
    readonly startNew: () => void;
    readonly draft: Draft;
    /**
     * Adds commands and keys active only while the draft has focus, until the caller's scope
     * closes; a dialog over the screen stops them.
     */
    readonly registerDraftCommands: (
      commands: ReadonlyArray<Command>,
      keys: ReadonlyArray<CommandKey>,
    ) => Effect.Effect<void, never, Scope.Scope>;
    /** The composer in the slot hands over its textarea; the last attach wins. */
    readonly attach: (draft: TextareaRenderable) => void;
    /** The composer calls it after each edit, so `draft.text` follows. */
    readonly edited: () => void;
  }
>()("chat/Screen") {}

const makeDraft = (
  textarea: Accessor<TextareaRenderable | undefined>,
  text: Accessor<string>,
): Draft => {
  const insert = (added: string) => {
    const input = textarea();
    if (input === undefined) return;

    input.gotoBufferEnd();
    input.insertText(text() === "" ? added : `\n\n${added}`);
  };

  const prepend = (added: string) => {
    const input = textarea();
    if (input === undefined) return;

    input.gotoBufferHome();
    input.insertText(text() === "" ? added : `${added}\n\n`);
  };

  const clearIf = (expected: string) => {
    if (text() === expected) textarea()?.clear();
  };

  return { text, insert, prepend, clearIf };
};

interface DraftCommands {
  readonly commands: ReadonlyArray<Command>;
  readonly keys: ReadonlyArray<CommandKey>;
}

const NOTHING_TO_REMOVE = () => {};

/** Each set of draft commands as a keymap layer on the textarea attached now, if any. */
const makeDraftLayers = (keymap: Keymap["Service"]) => {
  const unregisters = new Map<DraftCommands, () => void>();

  const place = (added: DraftCommands, textarea: TextareaRenderable | undefined) => {
    unregisters.get(added)?.();

    unregisters.set(
      added,
      textarea === undefined
        ? NOTHING_TO_REMOVE
        : keymap.registerLayer(commandLayer(added.commands, added.keys, textarea)),
    );
  };

  const remove = (added: DraftCommands) => {
    unregisters.get(added)?.();
    unregisters.delete(added);
  };

  const moveTo = (textarea: TextareaRenderable) => {
    for (const added of unregisters.keys()) place(added, textarea);
  };

  return { place, remove, moveTo };
};

export const makeChatScreen = Effect.gen(function* () {
  const keymap = yield* Keymap;
  const [session, setSession] = createSignal<SessionId>();
  const [textarea, setTextarea] = createSignal<TextareaRenderable>();
  // Read live, so keys typed in one burst see each other's edits; the signal only says it changed.
  const [edits, setEdits] = createSignal(0);

  const text = () => {
    edits();

    return textarea()?.plainText.trim() ?? "";
  };

  const layers = makeDraftLayers(keymap);

  const registerDraftCommands = (
    commands: ReadonlyArray<Command>,
    keys: ReadonlyArray<CommandKey>,
  ) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const added = { commands, keys };
        layers.place(added, textarea());

        return added;
      }),
      (added) =>
        Effect.sync(() => {
          layers.remove(added);
        }),
    ).pipe(Effect.asVoid);

  const screen: ChatScreen["Service"] = {
    session,
    show: (next) => setSession(() => next),
    startNew: () => {
      setSession(undefined);
    },
    draft: makeDraft(textarea, text),
    registerDraftCommands,
    attach: (draft) => {
      setTextarea(() => draft);
      layers.moveTo(draft);
    },
    edited: () => setEdits((count) => count + 1),
  };

  return screen;
});
