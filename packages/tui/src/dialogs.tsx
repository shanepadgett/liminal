/**
 * Dialogs over the screen, as a stack: only the top one shows, over a dimmed layer, and `escape`
 * closes it. Synchronous, so key handlers can open them.
 */
import { useBindings } from "@opentui/keymap/solid";
import type { JSX } from "@opentui/solid";
import { Context } from "effect";
import { type Accessor, createSignal, Show } from "solid-js";

import { Overlay } from "./kit/Overlay.tsx";

type DialogView = () => JSX.Element;

export class Dialogs extends Context.Service<
  Dialogs,
  {
    /** Shows `dialog` above the rest; the returned function closes it. */
    readonly open: (dialog: DialogView) => () => void;
    /** Closes the top dialog. */
    readonly close: () => void;
    /** The dialog showing, if any. */
    readonly top: Accessor<DialogView | undefined>;
  }
>()("tui/Dialogs") {}

export const makeDialogs = (): Dialogs["Service"] => {
  const [stack, setStack] = createSignal<ReadonlyArray<{ readonly view: DialogView }>>([]);

  const open = (view: DialogView) => {
    const entry = { view };
    setStack((dialogs) => [...dialogs, entry]);

    return () => setStack((dialogs) => dialogs.filter((each) => each !== entry));
  };

  const close = () => setStack((dialogs) => dialogs.slice(0, -1));
  const top = () => stack().at(-1)?.view;

  return { open, close, top };
};

function Shown(props: { readonly view: DialogView; readonly close: () => void }) {
  useBindings(() => ({
    commands: [{ name: "dialog.close", title: "Close dialog", run: props.close }],
    bindings: [{ key: "escape", cmd: "dialog.close" }],
  }));

  return <Overlay kind="dialog">{props.view()}</Overlay>;
}

/** The top dialog over a dimmed layer; nothing while the stack is empty. */
export function DialogLayer(props: { readonly dialogs: Dialogs["Service"] }) {
  return (
    <Show when={props.dialogs.top()} keyed>
      {(view) => <Shown view={view} close={props.dialogs.close} />}
    </Show>
  );
}
