/**
 * The chat screen as other plugins reach it: the session on screen, showing another or none, the
 * draft, and commands that act on the screen. Made with Solid signals in chat's `tui` layer; the
 * screen draws from the same ones, so a command from any plugin can change what shows.
 */
import type { SyntaxStyle, TextareaRenderable } from "@opentui/core";
import { Context, Effect, type Scope } from "effect";
import { type Accessor, createSignal } from "solid-js";

import type { SessionId } from "@shanepadgett/liminal-session/contract";
import {
  type Blocked,
  type Command,
  Colors,
  type CommandKey,
  commandLayer,
  Keymap,
} from "@shanepadgett/liminal-tui";

import { markRanges, type Written } from "../view/index.ts";
import { markText } from "./triggers.ts";

export interface Draft {
  /** The draft's text as it is now, trimmed; follows each edit. */
  readonly text: Accessor<string>;
  /** The texts marked in the draft now, such as `$skill`, in order. */
  readonly marks: () => ReadonlyArray<string>;
  /**
   * Adds `text` after the draft, with a blank line between. Each of `marks` is marked again in it,
   * at its first match after the mark before.
   */
  readonly insert: (text: string, marks?: ReadonlyArray<string>) => void;
  /** Puts `text` before the draft, with a blank line between; `marks` as for `insert`. */
  readonly prepend: (text: string, marks?: ReadonlyArray<string>) => void;
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
    /** Whether a turn runs in the session on screen. */
    readonly running: Accessor<boolean>;
    /** The session screen calls it as its turn starts and ends, so `running` follows. */
    readonly setRunning: (running: boolean) => void;
    readonly draft: Draft;
    /**
     * Adds commands and keys active only while the draft has focus, until the caller's scope
     * closes; a dialog over the screen stops them.
     */
    readonly registerDraftCommands: (
      commands: ReadonlyArray<Command>,
      keys: ReadonlyArray<CommandKey>,
    ) => Effect.Effect<void, never, Scope.Scope>;
    /** Whether a composer shows and its draft lacks focus, so `focusDraft` would move it. */
    readonly canFocusDraft: () => boolean;
    /** Puts focus on the composer's draft, when one shows. */
    readonly focusDraft: () => void;
    /** The composer in the slot hands over its textarea; the last attach wins. */
    readonly attach: (draft: TextareaRenderable) => void;
    /** The composer calls it after each edit, so `draft.text` follows. */
    readonly edited: () => void;
  }
>()("chat/Screen") {}

/**
 * The `blocked` of a command that runs only while no turn runs in the session on screen, such as
 * one that starts a turn of its own; `name` is its slash name.
 */
export const turnBlocked =
  (screen: ChatScreen["Service"], name: string) => (): Blocked | undefined =>
    screen.running()
      ? {
          title: `/${name} runs once the turn ends`,
          message: "Send it again when the turn is done.",
        }
      : undefined;

/** The screen's own commands, whose hints the composer shows even while its draft lacks focus. */
export const SCREEN_HINTS: ReadonlySet<string> = new Set(["chat.focus-draft", "chat.quit"]);

/** The texts of `input`'s marks, in order. */
const marksIn = (input: TextareaRenderable | undefined): ReadonlyArray<string> =>
  (input?.extmarks.getVirtual() ?? [])
    .toSorted((first, second) => first.start - second.start)
    .map((mark) => input?.getTextRange(mark.start, mark.end) ?? "");

/** Marks each of `added`'s marks in its text, which starts at editor offset `start` in `input`. */
const markAgain = (
  input: TextareaRenderable,
  added: Written,
  start: number,
  style: SyntaxStyle,
) => {
  for (const range of markRanges(added.text, added.marks)) {
    const at = start + input.editBuffer.measureText(added.text.slice(0, range.start));
    markText(input, at, added.text.slice(range.start, range.end), style);
  }
};

const makeDraft = (
  textarea: Accessor<TextareaRenderable | undefined>,
  text: Accessor<string>,
  style: Accessor<SyntaxStyle>,
): Draft => {
  const insert = (added: string, marks: ReadonlyArray<string> = []) => {
    const input = textarea();
    if (input === undefined) return;

    const gap = text() === "" ? "" : "\n\n";
    input.gotoBufferEnd();
    const start = input.cursorOffset + input.editBuffer.measureText(gap);
    input.insertText(`${gap}${added}`);
    markAgain(input, { text: added, marks }, start, style());
  };

  const prepend = (added: string, marks: ReadonlyArray<string> = []) => {
    const input = textarea();
    if (input === undefined) return;

    input.gotoBufferHome();
    input.insertText(text() === "" ? added : `${added}\n\n`);
    markAgain(input, { text: added, marks }, 0, style());
  };

  const clearIf = (expected: string) => {
    if (text() === expected) textarea()?.clear();
  };

  return { text, marks: () => marksIn(textarea()), insert, prepend, clearIf };
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
  const colors = yield* Colors;
  const [session, setSession] = createSignal<SessionId>();
  const [running, setRunning] = createSignal(false);
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
    running,
    setRunning: (next) => {
      setRunning(next);
    },
    draft: makeDraft(textarea, text, colors.syntax),
    registerDraftCommands,
    canFocusDraft: () => {
      const draft = textarea();

      return draft !== undefined && !draft.isDestroyed && !draft.focused;
    },
    focusDraft: () => {
      const draft = textarea();
      if (draft !== undefined && !draft.isDestroyed) draft.focus();
    },
    attach: (draft) => {
      setTextarea(() => draft);
      layers.moveTo(draft);
    },
    edited: () => setEdits((count) => count + 1),
  };

  return screen;
});
