/** A question in a dialog: enter confirms, esc cancels. */

import { useBindings } from "@opentui/keymap/solid";

import { useColor } from "../colors.ts";
import { keymapCommand, useHints } from "../commands.ts";
import { Dialog } from "./Dialog.tsx";

export function Confirm(props: {
  readonly title: string;
  readonly question: string;
  readonly onConfirm: () => void;
  readonly close: () => void;
}) {
  const color = useColor();
  const hints = useHints();

  // Above the dialog stack's own `escape`. Nothing has focus under a dialog with no input, so
  // these keys need no target.
  useBindings(() => ({
    priority: 1,
    commands: [
      {
        name: "confirm.yes",
        title: "Confirm",
        hint: { label: "confirm" },
        run: () => {
          props.close();
          props.onConfirm();
        },
      },
      { name: "confirm.no", title: "Cancel", hint: { label: "cancel" }, run: props.close },
    ].map(keymapCommand),
    bindings: [
      { key: "return", cmd: "confirm.yes" },
      { key: "kpenter", cmd: "confirm.yes" },
      { key: "escape", cmd: "confirm.no" },
    ],
  }));

  return (
    <Dialog title={props.title} hints={hints()}>
      <text fg={color("text.base")}>{props.question}</text>
    </Dialog>
  );
}
