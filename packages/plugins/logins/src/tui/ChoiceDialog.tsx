/**
 * A short list to pick from, each row with a note at the right such as its sign-in state. Up and
 * down move the highlight, enter picks the row, and ctrl+d signs it out when the caller allows.
 */

import { createSignal, For } from "solid-js";

import { DialogFrame, type DialogProps, type Hint, useBindings, useColor } from "@liminal/sdk/tui";

export interface Choice {
  readonly title: string;
  readonly note: string;
}

export interface ChoiceDialogProps extends DialogProps {
  readonly title: string;
  readonly hints: readonly Hint[];
  readonly choices: ReadonlyArray<Choice>;
  readonly onChoose: (index: number) => void;
  /** Runs on ctrl+d; the dialog stays open. */
  readonly onSignOut: (index: number) => void;
}

function ChoiceRow(props: { readonly choice: Choice; readonly isSelected: boolean }) {
  const color = useColor();

  return (
    <box
      flexDirection="row"
      height={1}
      marginX={-1}
      paddingX={1}
      gap={2}
      backgroundColor={props.isSelected ? color("surface.selected") : "transparent"}
    >
      <text flexGrow={1} wrapMode="none" fg={color(props.isSelected ? "text.base" : "text.muted")}>
        {props.choice.title}
      </text>
      <text flexShrink={0} wrapMode="none" fg={color("feedback.success")}>
        {props.choice.note}
      </text>
    </box>
  );
}

export function ChoiceDialog(props: ChoiceDialogProps) {
  const [selected, setSelected] = createSignal(0);

  const move = (by: number) => {
    const count = props.choices.length;
    if (count > 0) setSelected((index) => (index + by + count) % count);
  };

  useBindings(() => ({
    commands: [
      {
        name: "choice.up",
        run: () => {
          move(-1);
        },
      },
      {
        name: "choice.down",
        run: () => {
          move(1);
        },
      },
      {
        name: "choice.pick",
        run: () => {
          props.onChoose(selected());
        },
      },
      {
        name: "choice.sign-out",
        run: () => {
          props.onSignOut(selected());
        },
      },
    ],
    bindings: [
      { key: "up", cmd: "choice.up" },
      { key: "down", cmd: "choice.down" },
      { key: "return", cmd: "choice.pick" },
      { key: "ctrl+d", cmd: "choice.sign-out" },
    ],
  }));

  return (
    <DialogFrame title={props.title} hints={props.hints} close={props.close}>
      <box flexDirection="column">
        <For each={props.choices}>
          {(choice, index) => <ChoiceRow choice={choice} isSelected={index() === selected()} />}
        </For>
      </box>
    </DialogFrame>
  );
}
