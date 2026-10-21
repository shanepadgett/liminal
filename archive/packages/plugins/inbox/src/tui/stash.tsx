/**
 * Ctrl+s parks the draft as a stash, one list per workspace folder; `/pop` lists the stashes, enter
 * brings one back after the draft, and ctrl+d discards one after a confirm.
 */

import type { TextareaRenderable } from "@opentui/core";
import { DateTime, Effect } from "effect";

import {
  type Bridge,
  ConfirmDialog,
  type DialogProps,
  SelectDialog,
  type SelectOption,
  TuiCommands,
  TuiDialogs,
  type TuiDialogsService,
  TuiHost,
  TuiToasts,
  type TuiToastsService,
} from "@liminal/sdk/tui";

import { InboxRpcs, type Stash } from "../contract.ts";

/** The input of the composer showing now, which `/pop` writes into. */
export interface Editor {
  readonly current: () => TextareaRenderable | undefined;
  readonly use: (input: TextareaRenderable) => void;
  /** Forgets `input` when it is still the one in use. */
  readonly release: (input: TextareaRenderable | undefined) => void;
}

export const makeEditor = (): Editor => {
  let current: TextareaRenderable | undefined;

  return {
    current: () => current,
    use: (made) => {
      current = made;
    },
    release: (gone) => {
      if (current === gone) current = undefined;
    },
  };
};

/** A stash as a row: its first line, then when it was stashed. */
const optionOf = (stash: Stash): SelectOption<Stash> => ({
  title: stash.text.split("\n").find((line) => line.trim() !== "") ?? "",
  value: stash,
  description: DateTime.formatLocal(stash.createdAt, { dateStyle: "medium", timeStyle: "short" }),
});

/** Puts the stash's text after the draft, so no draft is lost. */
const popInto = (editor: Editor, stash: Stash) => {
  const input = editor.current();
  if (input === undefined) return;
  const draft = [input.plainText, stash.text].filter((part) => part !== "");
  input.replaceText(draft.join("\n\n"));
  input.gotoBufferEnd();
};

const failed = (toasts: TuiToastsService) => (error: { readonly message: string }) =>
  Effect.sync(() => {
    toasts.show({ kind: "error", title: "Stashes", message: error.message });
  });

interface PickerDeps {
  readonly bridge: Bridge;
  readonly editor: Editor;
  readonly dialogs: TuiDialogsService;
  readonly toasts: TuiToastsService;
  readonly remove: (stash: Stash) => Effect.Effect<void, { readonly message: string }>;
}

/** Asks before discarding `stash`, then opens the list again. */
const confirmDiscard = (deps: PickerDeps, stash: Stash, reopen: () => void) => {
  deps.dialogs.show((props: DialogProps) => (
    <ConfirmDialog
      title="Discard stash"
      question={optionOf(stash).title}
      action="discard"
      close={props.close}
      onConfirm={() => {
        deps.bridge.run(
          Effect.andThen(deps.remove(stash), Effect.sync(reopen)).pipe(
            Effect.catch(failed(deps.toasts)),
          ),
        );
      }}
    />
  ));
};

/** The stash list: enter pops a stash, ctrl+d discards one. */
const showPicker = (deps: PickerDeps, found: ReadonlyArray<Stash>, reopen: () => void) => {
  deps.dialogs.show((props: DialogProps) => (
    <SelectDialog
      title="Stashes"
      options={found.map(optionOf)}
      close={props.close}
      onSelect={(stash) => {
        popInto(deps.editor, stash);
        deps.bridge.run(deps.remove(stash).pipe(Effect.catch(failed(deps.toasts))));
      }}
      actions={[
        {
          key: "ctrl+d",
          label: "discard",
          run: (stash) => {
            confirmDiscard(deps, stash, reopen);
          },
        },
      ]}
    />
  ));
};

/** Registers `/pop`; gives `stash(text, done)`, which calls `done` once the text is safe. */
export const stashes = Effect.fn("Inbox.stashes")(function* (bridge: Bridge, editor: Editor) {
  const inbox = yield* (yield* TuiHost).client(InboxRpcs);
  const toasts = yield* TuiToasts;

  const deps: PickerDeps = {
    bridge,
    editor,
    dialogs: yield* TuiDialogs,
    toasts,
    remove: (stash) => inbox["inbox/unstash"]({ id: stash.id }),
  };

  const open: Effect.Effect<void> = Effect.gen(function* () {
    const found = yield* inbox["inbox/stashes"]();

    if (found.length === 0) {
      toasts.show({
        kind: "info",
        title: "Nothing is stashed",
        message: "Ctrl+s stashes the draft.",
      });

      return;
    }

    showPicker(deps, found, () => {
      bridge.run(open);
    });
  }).pipe(Effect.catch(failed(toasts)));

  yield* (yield* TuiCommands).register([
    {
      name: "inbox.pop",
      title: "Stashes",
      desc: "Bring back or discard a stashed draft",
      category: "Session",
      slash: { name: "pop" },
      palette: true,
      run: () => {
        bridge.run(open);
      },
    },
  ]);

  return (text: string, done: () => void) => {
    bridge.run(
      inbox["inbox/stash"]({ text }).pipe(
        Effect.map((stashed) => {
          done();

          toasts.show(
            stashed === "duplicate"
              ? { kind: "info", title: "Already stashed" }
              : { kind: "success", title: "Stashed", message: "/pop brings it back." },
          );
        }),
        Effect.catch(failed(toasts)),
      ),
    );
  };
});
