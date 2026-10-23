/**
 * Dialogs over the screen, as a stack: only the top one shows, over a dimmed layer, and `escape`
 * closes it. Opening a dialog takes focus from the screen, so keys bound to what had focus stop;
 * closing it focuses that again, such as the draft. Synchronous, so key handlers can open them.
 */
import type { CliRenderer } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import type { JSX } from "@opentui/solid";
import { Context } from "effect";
import { type Accessor, createSignal, Show } from "solid-js";

import { Overlay } from "./kit/Overlay.tsx";

/** Draws a dialog; `close` takes this dialog off the stack. */
export type DialogView = (close: () => void) => JSX.Element;

interface Shown {
  readonly view: DialogView;
  readonly close: () => void;
}

export class Dialogs extends Context.Service<
  Dialogs,
  {
    /** Shows `dialog` above the rest; the returned function closes it. */
    readonly open: (dialog: DialogView) => () => void;
    /** Closes the top dialog. */
    readonly close: () => void;
    /** The dialog showing, if any. */
    readonly top: Accessor<Shown | undefined>;
  }
>()("tui/Dialogs") {}

export const makeDialogs = (renderer: CliRenderer): Dialogs["Service"] => {
  const [stack, setStack] = createSignal<ReadonlyArray<Shown>>([]);

  const open = (view: DialogView) => {
    const focused = renderer.currentFocusedRenderable;
    focused?.blur();

    const close = () => {
      setStack((dialogs) => dialogs.filter((each) => each !== entry));
      if (focused !== null && !focused.isDestroyed) focused.focus();
    };

    const entry: Shown = { view, close };
    setStack((dialogs) => [...dialogs, entry]);

    return close;
  };

  const close = () => stack().at(-1)?.close();
  const top = () => stack().at(-1);

  return { open, close, top };
};

function ShownDialog(props: { readonly shown: Shown }) {
  useBindings(() => ({
    commands: [{ name: "dialog.close", title: "Close dialog", run: props.shown.close }],
    bindings: [{ key: "escape", cmd: "dialog.close" }],
  }));

  return <Overlay kind="dialog">{props.shown.view(props.shown.close)}</Overlay>;
}

/** The top dialog over a dimmed layer; nothing while the stack is empty. */
export function DialogLayer(props: { readonly dialogs: Dialogs["Service"] }) {
  return (
    <Show when={props.dialogs.top()} keyed>
      {(shown) => <ShownDialog shown={shown} />}
    </Show>
  );
}
