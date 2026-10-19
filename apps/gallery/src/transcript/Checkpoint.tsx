/**
 * A checkpoint in the transcript: where the model's view starts over. A faint rule spans the
 * transcript with "Checkpoint" in its middle and a blank line above and below it; everything above
 * it stays in the transcript, but the model now sees only its memories, the handoff and what
 * follows. In the debug view the handoff the model wrote sits under the rule, folded to its first
 * line and cut at the edge; clicking it unfolds the whole handoff, muted. An automatic checkpoint,
 * written when the provider's cache was already lost, has no handoff. Each note or memory written
 * in the background shows in the debug view as one faint line where it was written.
 */

import { Show } from "solid-js";

import type { RoleColor } from "@liminal/sdk/tui";

export type CheckpointMessage = {
  /** What the model wrote for itself to carry on from; none for an automatic checkpoint. */
  readonly handoff?: string;
};

/** The handoff's first line, shown while it is folded. */
const firstLine = (text: string): string => text.split("\n", 1)[0] ?? "";

/** One stretch of the rule: a box whose only border is its top edge. */
function Rule(props: { readonly color: RoleColor }) {
  return (
    <box flexGrow={1} height={1} border={["top"]} borderColor={props.color("border.subtle")} />
  );
}

/** The handoff, shown only in the debug view. */
function Handoff(props: {
  readonly color: RoleColor;
  readonly handoff: string;
  readonly isFolded: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <box flexDirection="column" onMouseUp={props.onToggle}>
      <text wrapMode="none" fg={props.color("text.faint")}>
        {`${props.isFolded ? "▸" : "▾"} Handoff${props.isFolded ? `  ${firstLine(props.handoff)}` : ""}`}
      </text>
      <Show when={!props.isFolded}>
        <box paddingLeft={2}>
          <text fg={props.color("text.faint")}>{props.handoff}</text>
        </box>
      </Show>
    </box>
  );
}

export function Checkpoint(props: {
  readonly color: RoleColor;
  readonly checkpoint: CheckpointMessage;
  readonly isDebug: boolean;
  readonly isFolded: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <box flexDirection="column">
      <box flexDirection="row" paddingY={1}>
        <Rule color={props.color} />
        <text fg={props.color("text.ghost")}> Checkpoint </text>
        <Rule color={props.color} />
      </box>
      <Show when={props.isDebug ? props.checkpoint.handoff : undefined}>
        {(handoff) => (
          <Handoff
            color={props.color}
            handoff={handoff()}
            isFolded={props.isFolded}
            onToggle={props.onToggle}
          />
        )}
      </Show>
    </box>
  );
}

/** A note or memory in the debug view: `Short-term note, entries 121–160, 1,840 tokens`. */
export function NoteLine(props: { readonly color: RoleColor; readonly text: string }) {
  return <text fg={props.color("text.faint")}>{props.text}</text>;
}
