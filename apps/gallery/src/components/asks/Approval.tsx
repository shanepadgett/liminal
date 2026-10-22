/**
 * The ask for a tool call that needs the user's yes: which tool, and what the call will do in the
 * model's words. The call's input stays in its transcript row, where a long script has room.
 * Approve and Reject are rows the cursor moves through; moving to Reject opens a note under it for
 * telling the model why. More calls waiting show on the title line's right; the oldest is the one
 * shown.
 */

import { For } from "solid-js";

import { ChoiceRow, labelColumnsOf, POINTER_COLUMNS } from "../../primitives/ChoiceRow.tsx";
import type { Hint } from "../../primitives/Hints.tsx";
import { useColor } from "../../theme/theme.tsx";
import { Ask, Note } from "./Ask.tsx";

/** One call waiting for the user. */
export interface ApprovalCall {
  readonly tool: string;
  /** What the call will do, as the model explained it. */
  readonly explanation: string;
}

/** Where the cursor is: on Approve, or on Reject with the note written so far. */
export type ApprovalCursor =
  | { readonly kind: "approve" }
  | { readonly kind: "reject"; readonly note: string };

const CHOICES = ["Approve", "Reject"] as const;

const COLUMNS = labelColumnsOf(CHOICES);

const isUnder = (cursor: ApprovalCursor, choice: (typeof CHOICES)[number]) =>
  (choice === "Approve") === (cursor.kind === "approve");

export function Approval(props: {
  readonly call: ApprovalCall;
  /** Calls waiting behind this one. */
  readonly waiting: number;
  readonly cursor: ApprovalCursor;
}) {
  const color = useColor();
  const note = () => (props.cursor.kind === "reject" ? props.cursor.note : undefined);

  return (
    <Ask
      mark="△"
      markRole="feedback.warning"
      title={`Run ${props.call.tool}?`}
      aside={props.waiting > 0 ? `${props.waiting} more waiting` : undefined}
    >
      <text fg={color("text.muted")}>{props.call.explanation}</text>
      <box marginTop={1}>
        <For each={CHOICES}>
          {(choice) => (
            <ChoiceRow
              label={choice}
              labelColumns={COLUMNS}
              isUnder={isUnder(props.cursor, choice)}
            />
          )}
        </For>
        <Note
          note={note()}
          isWriting={note() !== undefined}
          placeholder="Tell the model why (optional)"
          indent={POINTER_COLUMNS}
        />
      </box>
    </Ask>
  );
}

export const approvalHintsOf = (cursor: ApprovalCursor): readonly Hint[] =>
  cursor.kind === "reject"
    ? [
        { keys: "↑↓", label: "choose" },
        { keys: "enter", label: "reject" },
      ]
    : [
        { keys: "↑↓", label: "choose" },
        { keys: "enter", label: "approve" },
        { keys: "esc", label: "reject" },
      ];
