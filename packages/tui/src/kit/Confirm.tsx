/**
 * Asking before a destructive action, in the dialog's footer: the question shows where the key
 * hints were, enter answers yes and esc cancels. A dialog keeps the state with `useConfirm` and
 * passes it to `Dialog` as `confirming`.
 */

import { useBindings } from "@opentui/keymap/solid";
import { createSignal } from "solid-js";

import { keymapCommand } from "../commands.ts";

/** What is asked, and the action enter runs. */
export interface Confirming {
  readonly question: string;
  readonly run: () => void;
}

/**
 * The question asked now, if any. While one is, enter runs its action and esc drops it; both sit
 * above the dialog's own keys.
 */
export const useConfirm = () => {
  const [confirming, setConfirming] = createSignal<Confirming>();
  const isAsking = () => confirming() !== undefined;

  const cancel = () => {
    setConfirming(undefined);
  };

  useBindings(() => ({
    priority: 2,
    commands: [
      {
        name: "confirm.yes",
        title: "Confirm",
        enabled: isAsking,
        run: () => {
          const asked = confirming();
          cancel();
          asked?.run();
        },
      },
      { name: "confirm.no", title: "Cancel", enabled: isAsking, run: cancel },
    ].map(keymapCommand),
    bindings: [
      { key: "return", cmd: "confirm.yes" },
      { key: "kpenter", cmd: "confirm.yes" },
      { key: "escape", cmd: "confirm.no" },
    ],
  }));

  return { confirming, isAsking, ask: setConfirming, cancel };
};
