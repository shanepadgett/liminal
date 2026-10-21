/**
 * Asks before something that cannot be undone from here; enter does it, esc keeps things as they
 * are.
 */

import { useBindings } from "@opentui/keymap/solid";

import { enterKeys } from "./commands.ts";
import { DialogFrame, type DialogProps } from "./dialogs.tsx";
import type { Hint } from "./Hints.tsx";
import { useColor } from "./theme.ts";

export interface ConfirmDialogProps extends DialogProps {
  readonly title: string;
  readonly question: string;
  /** What enter does, such as "sign out". */
  readonly action: string;
  /** Runs after the dialog closes. */
  readonly onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const color = useColor();

  const hints = (): readonly Hint[] => [
    ["enter", props.action],
    ["esc", "keep"],
  ];

  useBindings(() => ({
    commands: [
      {
        name: "confirm.yes",
        run: () => {
          props.close();
          props.onConfirm();
        },
      },
    ],
    bindings: enterKeys("confirm.yes"),
  }));

  return (
    <DialogFrame title={props.title} hints={hints()} close={props.close}>
      <text fg={color("text.base")}>{props.question}</text>
    </DialogFrame>
  );
}
