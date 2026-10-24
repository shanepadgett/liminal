/**
 * The asks for a tool call or a folder the reviewer would not allow on its own. A call shows the
 * reviewer's summary, one line per effect with deletions and sends in the warning color, and the
 * risk; a failed review says so in their place. A folder shows the path, reading or changing, and
 * the agent's reason labelled as the agent's. The call's input stays in its transcript row. Approve
 * and Reject are `Choices`; moving to Reject opens a note under it for telling the model why. More
 * asks waiting show on the title line's right; the oldest is the one shown.
 */

import type { JSX } from "@opentui/solid";
import { For, Show } from "solid-js";

import { POINTER_COLUMNS } from "../../primitives/ChoiceRow.tsx";
import { type Choice, Choices, choicesHintsOf } from "../../primitives/Choices.tsx";
import type { Hint } from "../../primitives/Hints.tsx";
import { useColor } from "../../theme/theme.tsx";
import { Ask, moreAside, Note } from "./Ask.tsx";

export interface Change {
  readonly kind: "creates" | "changes" | "deletes" | "sends" | "installs" | "starts";
  readonly target: string;
}

export interface Verdict {
  readonly summary: string;
  readonly effects: readonly Change[];
  readonly risk: string;
}

/** One call waiting for the user, with what the reviewer found or why it could not. */
export interface ApprovalCall {
  readonly tool: string;
  readonly review:
    | { readonly kind: "verdict"; readonly verdict: Verdict }
    | { readonly kind: "failed"; readonly message: string };
}

/** A folder outside the workspace the model wants to reach. */
export interface AccessRequest {
  readonly path: string;
  readonly write: boolean;
  readonly reason: string;
  /** Why the review failed, when it did. */
  readonly failed?: string;
}

/** Where the cursor is: on Approve, or on Reject with the note written so far. */
export type ApprovalCursor =
  | { readonly kind: "approve" }
  | { readonly kind: "reject"; readonly note: string };

const CHOICES: readonly Choice[] = [
  { label: "Approve", hint: "approve" },
  { label: "Reject", hint: "reject" },
];

const KIND_COLUMNS = 10;

const isAlarming = (change: Change) => change.kind === "deletes" || change.kind === "sends";

function Found(props: { readonly verdict: Verdict }) {
  const color = useColor();

  return (
    <box>
      <text fg={color("text.base")}>{props.verdict.summary}</text>
      <For each={props.verdict.effects}>
        {(change) => (
          <text>
            <span style={{ fg: color(isAlarming(change) ? "feedback.warning" : "text.muted") }}>
              {change.kind.padEnd(KIND_COLUMNS)}
            </span>
            <span style={{ fg: color("text.base") }}>{change.target}</span>
          </text>
        )}
      </For>
      <text fg={color("text.muted")}>{props.verdict.risk}</text>
    </box>
  );
}

/** The frame both asks share: title, body, then Approve and Reject with the note under Reject. */
function Choose(props: {
  readonly title: string;
  /** Asks waiting behind this one. */
  readonly waiting: number;
  readonly cursor: ApprovalCursor;
  readonly children: JSX.Element;
}) {
  const note = () => (props.cursor.kind === "reject" ? props.cursor.note : undefined);

  return (
    <Ask mark="△" markRole="feedback.warning" title={props.title} aside={moreAside(props.waiting)}>
      {props.children}
      <box marginTop={1}>
        <Choices choices={CHOICES} under={props.cursor.kind === "approve" ? 0 : 1} />
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

export function Approval(props: {
  readonly call: ApprovalCall;
  readonly waiting: number;
  readonly cursor: ApprovalCursor;
}) {
  const color = useColor();

  const verdict = () =>
    props.call.review.kind === "verdict" ? props.call.review.verdict : undefined;

  const failure = () => (props.call.review.kind === "failed" ? props.call.review.message : "");

  return (
    <Choose title={`Run ${props.call.tool}?`} waiting={props.waiting} cursor={props.cursor}>
      <Show
        when={verdict()}
        fallback={
          <text fg={color("feedback.warning")}>
            {`The review failed: ${failure()}. No one checked this call.`}
          </text>
        }
      >
        {(found) => <Found verdict={found()} />}
      </Show>
    </Choose>
  );
}

export function Access(props: {
  readonly request: AccessRequest;
  readonly waiting: number;
  readonly cursor: ApprovalCursor;
}) {
  const color = useColor();

  const title = () =>
    props.request.write
      ? "Allow changing files outside the workspace?"
      : "Allow reading outside the workspace?";

  return (
    <Choose title={title()} waiting={props.waiting} cursor={props.cursor}>
      <text fg={color("text.base")}>{props.request.path}</text>
      <text fg={color("text.muted")}>{`The agent says: "${props.request.reason}"`}</text>
      <Show when={props.request.failed}>
        {(failed) => (
          <text fg={color("feedback.warning")}>
            {`The review failed: ${failed()}. No one checked this request.`}
          </text>
        )}
      </Show>
    </Choose>
  );
}

/** `Choices`' hints, then esc: on Approve it moves to Reject, on Reject it cancels the turn. */
export const approvalHintsOf = (cursor: ApprovalCursor): readonly Hint[] => [
  ...choicesHintsOf(CHOICES, cursor.kind === "approve" ? 0 : 1),
  { keys: "esc", label: cursor.kind === "approve" ? "reject" : "cancel" },
];
