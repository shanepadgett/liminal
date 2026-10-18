/**
 * The session's approval mode after the composer's model line, `full` in the warning color.
 * Shift+tab cycles the mode, and the session's oldest waiting ask opens the approval dialog.
 */

import { Option } from "effect";
import { type Accessor, createEffect, onCleanup, Show } from "solid-js";

import type { TurnProps } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import { type DialogComponent, useBindings, useColor } from "@liminal/sdk/tui";

import { type ApprovalMode, approvalModes, type PendingAsk } from "../contract.ts";
import { ApprovalDialog } from "./ApprovalDialog.tsx";

/** What the label reads and does, made once by the part's setup. */
export interface LabelDeps {
  readonly mode: (session: SessionId) => Accessor<Option.Option<ApprovalMode>>;
  readonly pending: (session: SessionId) => Accessor<ReadonlyArray<PendingAsk>>;
  readonly setMode: (session: SessionId, mode: ApprovalMode) => void;
  readonly answer: (id: string, approve: boolean, note: string) => void;
  readonly show: (dialog: DialogComponent) => void;
  /** Marks the session whose composer is on screen, for `/approvals`. */
  readonly onScreen: (session?: SessionId) => void;
}

/** The mode after `mode` in the cycle. */
export const nextMode = (mode: ApprovalMode) =>
  approvalModes[(approvalModes.indexOf(mode) + 1) % approvalModes.length] ?? "auto";

/** Opens the dialog for each new oldest ask. */
const showAsks = (deps: LabelDeps, pending: Accessor<ReadonlyArray<PendingAsk>>) => {
  let shown = "";

  createEffect(() => {
    const [oldest] = pending();
    if (oldest === undefined || oldest.id === shown) return;

    shown = oldest.id;

    deps.show((dialog) => (
      <ApprovalDialog
        close={dialog.close}
        ask={oldest}
        waiting={() => pending().some((each) => each.id === oldest.id)}
        onAnswer={(approve, note) => {
          deps.answer(oldest.id, approve, note);
        }}
      />
    ));
  });
};

export const makeModeLabel = (deps: LabelDeps) =>
  function ModeLabel(props: TurnProps & { readonly sessionId: SessionId }) {
    const color = useColor();
    const mode = deps.mode(props.sessionId);

    deps.onScreen(props.sessionId);

    onCleanup(() => {
      deps.onScreen();
    });

    showAsks(deps, deps.pending(props.sessionId));

    useBindings(() => ({
      commands: [
        {
          name: "approval.cycle",
          run: () => {
            const current = mode();
            if (Option.isSome(current)) deps.setMode(props.sessionId, nextMode(current.value));
          },
        },
      ],
      bindings: [{ key: "shift+tab", cmd: "approval.cycle" }],
    }));

    return (
      <Show when={Option.getOrUndefined(mode())}>
        {(shown) => (
          <text wrapMode="none">
            <span style={{ fg: color("text.faint") }}>{"approval "}</span>
            <span style={{ fg: color(shown() === "full" ? "feedback.warning" : "text.muted") }}>
              {shown()}
            </span>
          </text>
        )}
      </Show>
    );
  };
