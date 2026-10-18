/**
 * Asks the user about one tool call: the command or path in the heading color, the reviewer's
 * summary when it wrote one, and why the call was flagged. Up and down choose approve or reject; on
 * reject a note line opens for telling the agent why. Esc rejects.
 */

import { For, Show } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";

/** One call waiting for the user. */
export interface ApprovalAsk {
  readonly tool: string;
  readonly subject: string;
  readonly reason: string;
  readonly summary?: string;
}

const CHOICES = ["Approve", "Reject"] as const;

const hintsFor = (isRejecting: boolean): readonly Hint[] => [
  ["↑↓", "choose"],
  ["enter", isRejecting ? "reject" : "approve"],
  ["esc", "reject"],
];

export function ApprovalDialog(props: {
  readonly color: RoleColor;
  readonly ask: ApprovalAsk;
  readonly isRejecting: boolean;
  /** The note typed so far while rejecting. */
  readonly note: string;
}) {
  const chosen = () => (props.isRejecting ? 1 : 0);

  return (
    <Dialog
      color={props.color}
      title={`Run ${props.ask.tool}?`}
      hints={hintsFor(props.isRejecting)}
    >
      <text fg={props.color("text.heading")}>{props.ask.subject}</text>
      <Show when={props.ask.summary}>
        {(summary) => <text fg={props.color("text.base")}>{summary()}</text>}
      </Show>
      <text fg={props.color("text.muted")}>{`Asked because ${props.ask.reason}`}</text>
      <box flexDirection="column">
        <For each={CHOICES}>
          {(choice, index) => (
            <text fg={props.color(index() === chosen() ? "text.accent" : "text.base")}>
              {`${index() === chosen() ? "›" : " "} ${choice}`}
            </text>
          )}
        </For>
      </box>
      <Show when={props.isRejecting}>
        <box flexDirection="row">
          <text flexShrink={0} fg={props.color("text.accent")}>
            {"› "}
          </text>
          <input
            focused
            flexGrow={1}
            value={props.note}
            placeholder="Tell the agent why (optional)"
            backgroundColor={props.color("surface.raised")}
            focusedBackgroundColor={props.color("surface.raised")}
            textColor={props.color("text.heading")}
            focusedTextColor={props.color("text.heading")}
            placeholderColor={props.color("text.faint")}
            cursorColor={props.color("text.accent")}
          />
        </box>
      </Show>
    </Dialog>
  );
}
