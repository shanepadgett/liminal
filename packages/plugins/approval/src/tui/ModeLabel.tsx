/**
 * The session's approval mode after the composer's model line, `full` in the warning color.
 * Shift+tab cycles the mode, and the session's waiting asks go to the approval prompt.
 */

import { Option } from "effect";
import { type Accessor, createEffect, onCleanup, Show } from "solid-js";

import type { TurnProps } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import { useBindings, useColor } from "@liminal/sdk/tui";

import { type ApprovalMode, approvalModes, type PendingAsk } from "../contract.ts";

/** What the label reads and does, made once by the part's setup. */
export interface LabelDeps {
  readonly mode: (session: SessionId) => Accessor<Option.Option<ApprovalMode>>;
  readonly pending: (session: SessionId) => Accessor<ReadonlyArray<PendingAsk>>;
  readonly setMode: (session: SessionId, mode: ApprovalMode) => void;
  /** Sets the waiting asks of the session on screen, for the approval prompt. */
  readonly setPending: (asks: ReadonlyArray<PendingAsk>) => void;
  /** Marks the session whose composer is on screen, for `/approvals`. */
  readonly onScreen: (session?: SessionId) => void;
}

/** The mode after `mode` in the cycle. */
export const nextMode = (mode: ApprovalMode) =>
  approvalModes[(approvalModes.indexOf(mode) + 1) % approvalModes.length] ?? "auto";

/** Hands the session's waiting asks to the prompt, and clears them when the label goes. */
const followAsks = (deps: LabelDeps, pending: Accessor<ReadonlyArray<PendingAsk>>) => {
  createEffect(() => {
    deps.setPending(pending());
  });

  onCleanup(() => {
    deps.setPending([]);
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

    followAsks(deps, deps.pending(props.sessionId));

    useBindings(() => ({
      commands: [
        {
          name: "approvals.cycle",
          run: () => {
            const current = mode();
            if (Option.isSome(current)) deps.setMode(props.sessionId, nextMode(current.value));
          },
        },
      ],
      bindings: [{ key: "shift+tab", cmd: "approvals.cycle" }],
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
