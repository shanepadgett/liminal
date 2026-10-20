/**
 * The approval prompt, a custom prompt in the composer's place: which tool wants to run, the
 * reviewer's plain-words summary of the call (the command or path when it wrote none), and why the
 * call was flagged. Approve and reject are rows the cursor moves through; on reject a note line
 * opens under it for telling the agent why. More asks waiting show at the title's right end; the
 * oldest is the one shown. Esc rejects.
 */

import { For, Show } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { ListRow } from "./ListRow.tsx";
import { type ApprovalMode } from "./ModelLine.tsx";
import { PromptFrame } from "./PromptFrame.tsx";

/** One call waiting for the user. */
export interface ApprovalAsk {
  readonly tool: string;
  readonly subject: string;
  readonly reason: string;
  readonly summary?: string;
}

const CHOICES = ["Approve", "Reject"] as const;

/** Under the Reject row, where its note goes: past the row's start, so it reads as Reject's. */
const NOTE_LEAD = "  └ ";

const hintsFor = (isRejecting: boolean): readonly Hint[] => [
  ["↑↓", "choose"],
  ["enter", isRejecting ? "reject" : "approve"],
  ["esc", "reject"],
];

const waitingText = (count: number) => `${count} more waiting`;

function NoteLine(props: { readonly color: RoleColor; readonly note: string }) {
  const surface = () => props.color("surface.selected");

  return (
    <box flexDirection="row" height={1}>
      <text wrapMode="none" flexShrink={0} fg={props.color("text.ghost")}>
        {NOTE_LEAD}
      </text>
      <textarea
        flexGrow={1}
        height={1}
        initialValue={props.note}
        placeholder="Tell the agent why (optional)"
        backgroundColor={surface()}
        focusedBackgroundColor={surface()}
        textColor={props.color("text.heading")}
        focusedTextColor={props.color("text.heading")}
        placeholderColor={props.color("text.faint")}
        cursorColor={props.color("text.accent")}
      />
    </box>
  );
}

export function ApprovalPrompt(props: {
  readonly color: RoleColor;
  readonly approval: ApprovalMode;
  readonly ask: ApprovalAsk;
  /** Asks behind this one. */
  readonly waiting: number;
  readonly isRejecting: boolean;
  /** The note typed so far while rejecting. */
  readonly note: string;
}) {
  const chosen = () => (props.isRejecting ? 1 : 0);

  return (
    <PromptFrame color={props.color} approval={props.approval} hints={hintsFor(props.isRejecting)}>
      <box flexDirection="row">
        <text flexGrow={1} wrapMode="none" truncate fg={props.color("text.heading")}>
          {`Run ${props.ask.tool}?`}
        </text>
        <Show when={props.waiting > 0}>
          <text flexShrink={0} wrapMode="none" fg={props.color("text.faint")}>
            {waitingText(props.waiting)}
          </text>
        </Show>
      </box>
      <text marginTop={1} fg={props.color("text.base")}>
        {props.ask.summary ?? props.ask.subject}
      </text>
      <text fg={props.color("text.muted")}>{`Asked because ${props.ask.reason}`}</text>
      <box flexDirection="column" marginTop={1}>
        <For each={CHOICES}>
          {(choice, index) => (
            <>
              <ListRow color={props.color} isSelected={index() === chosen()}>
                <text fg={props.color(index() === chosen() ? "text.base" : "text.muted")}>
                  {choice}
                </text>
              </ListRow>
              <Show when={choice === "Reject" && props.isRejecting}>
                <NoteLine color={props.color} note={props.note} />
              </Show>
            </>
          )}
        </For>
      </box>
    </PromptFrame>
  );
}
