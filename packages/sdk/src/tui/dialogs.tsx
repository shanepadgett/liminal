/**
 * The dialog stack: commands show dialogs, the app root draws the top one over everything, and
 * closing it shows the one under it again.
 */

import { RGBA } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import type { JSX } from "@opentui/solid";
import { Context } from "effect";
import { type Accessor, type Component, createSignal, Show } from "solid-js";

import { type Hint, Hints } from "./Hints.tsx";
import { HeaderRule } from "./ornament/HeaderRule.tsx";
import { useColor } from "./theme.ts";

/** What every dialog receives: how to close itself. */
export interface DialogProps {
  readonly close: () => void;
}

export type DialogComponent = Component<DialogProps>;

export interface TuiDialogsService {
  /** Shows `dialog` over the current one. */
  readonly show: (dialog: DialogComponent) => void;
  /** Closes the top dialog. */
  readonly close: () => void;
  /** The dialog on top, if any is open. */
  readonly top: Accessor<DialogComponent | undefined>;
}

/** The dialog stack; every UI part's setup can read it. */
export class TuiDialogs extends Context.Service<TuiDialogs, TuiDialogsService>()(
  "liminal/sdk/TuiDialogs",
) {}

/** An empty dialog stack. */
export const makeTuiDialogs = (): TuiDialogsService => {
  const [stack, setStack] = createSignal<ReadonlyArray<DialogComponent>>([]);

  return {
    show: (dialog) => setStack((open) => [...open, dialog]),
    close: () => setStack((open) => open.slice(0, -1)),
    top: () => stack().at(-1),
  };
};

/** Draws the top dialog, if any; the app root places it over the root slot. */
export function DialogLayer(props: { readonly dialogs: TuiDialogsService }) {
  return (
    <Show when={props.dialogs.top()} keyed>
      {(Top) => <Top close={props.dialogs.close} />}
    </Show>
  );
}

/** The dark wash over the chat under a dialog, so the dialog reads first. */
const SCRIM = RGBA.fromInts(0, 0, 0, 150);

/** The dialog's width, unless the window is narrower. */
const DIALOG_COLUMNS = 60;

/** Above the sidebar drawer, which is at 1. */
const Z_INDEX = 10;

/**
 * A panel centered over the whole window on the raised surface: the title in the accent, the rule,
 * then `esc`, which closes it; key hints sit at the bottom.
 */
export function DialogFrame(props: {
  readonly title: string;
  readonly hints: readonly Hint[];
  readonly close: () => void;
  readonly children: JSX.Element;
}) {
  const color = useColor();

  useBindings(() => ({
    commands: [
      {
        name: "dialog.close",
        run: () => {
          props.close();
        },
      },
    ],
    bindings: [{ key: "escape", cmd: "dialog.close" }],
  }));

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={Z_INDEX}
      alignItems="center"
      justifyContent="center"
      backgroundColor={SCRIM}
    >
      <box
        width={DIALOG_COLUMNS}
        maxWidth="100%"
        maxHeight="100%"
        flexDirection="column"
        gap={1}
        paddingX={2}
        paddingY={1}
        backgroundColor={color("surface.raised")}
      >
        <box flexDirection="row" flexShrink={0}>
          <text flexShrink={0} wrapMode="none" fg={color("text.accent")}>
            {`${props.title} `}
          </text>
          <HeaderRule color={color} surface="surface.raised" isWorking={false} />
          <text flexShrink={0} fg={color("text.faint")}>
            {" esc"}
          </text>
        </box>
        {props.children}
        <box flexShrink={0}>
          <Hints color={color} hints={props.hints} />
        </box>
      </box>
    </box>
  );
}
