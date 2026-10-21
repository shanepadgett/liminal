/**
 * A checkpoint in the transcript: where the model's view starts over. A faint rule spans the
 * transcript with "Checkpoint" in its middle and a blank line above and below it; everything above
 * it stays in the transcript, but the model now sees only its memories, the handoff and what
 * follows. In the debug view the handoff the model wrote sits under the rule, folded to its first
 * line and cut at the edge; clicking it unfolds the whole handoff, muted. An automatic checkpoint,
 * written when the provider's cache was already lost, has no handoff. When the checkpoint read
 * files back in for the model, the rule counts them: "Checkpoint · 6 files read". In the debug view
 * the files read sit under the rule, folded to one line; clicking it lists each file with its
 * lines, then the files the cap left out. Each short-term or long-term memory written in the
 * background shows in the debug view as one faint line where it was written.
 */

import { For, Show } from "solid-js";

import type { RoleColor } from "@liminal/sdk/tui";

export type CheckpointMessage = {
  /** What the model wrote for itself to carry on from; none for an automatic checkpoint. */
  readonly handoff?: string;
  /** How many files the checkpoint read back in for the model. */
  readonly restored: number;
};

/** One file a checkpoint read back: its path and the lines read, `all` for the whole file. */
export type RestoredFile = { readonly path: string; readonly lines: string };

/** The files a checkpoint read back, and those the cap left out. */
export type RestoredFiles = {
  readonly files: ReadonlyArray<RestoredFile>;
  readonly leftOut: ReadonlyArray<string>;
};

/** `Checkpoint`, then how many files it read back, if any. */
const labelOf = (restored: number): string => {
  if (restored === 0) return " Checkpoint ";

  return ` Checkpoint · ${restored} ${restored === 1 ? "file" : "files"} read `;
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
        {/* A text at a half column is drawn a column left of where the rules end; a box rounds like them. */}
        <box flexShrink={0}>
          <text fg={props.color("text.ghost")}>{labelOf(props.checkpoint.restored)}</text>
        </box>
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

/** The files a checkpoint read back, in the debug view, folded to one line until clicked. */
export function RestoredLine(props: {
  readonly color: RoleColor;
  readonly restored: RestoredFiles;
  readonly isFolded: boolean;
  readonly onToggle: () => void;
}) {
  const summary = () => {
    const read = `${props.restored.files.length} read`;
    const left = props.restored.leftOut.length;

    return left === 0 ? read : `${read}, ${left} left out`;
  };

  return (
    <box flexDirection="column" onMouseUp={props.onToggle}>
      <text wrapMode="none" fg={props.color("text.faint")}>
        {`${props.isFolded ? "▸" : "▾"} Files  ${summary()}`}
      </text>
      <Show when={!props.isFolded}>
        <box paddingLeft={2} flexDirection="column">
          <For each={props.restored.files}>
            {(file) => (
              <text wrapMode="none" fg={props.color("text.faint")}>
                {`${file.path}  ${file.lines}`}
              </text>
            )}
          </For>
          <For each={props.restored.leftOut}>
            {(path) => (
              <text wrapMode="none" fg={props.color("text.ghost")}>
                {`${path}  left out`}
              </text>
            )}
          </For>
        </box>
      </Show>
    </box>
  );
}

/** A memory written, in the debug view: `Short-term memory, entries 121–160, 1,840 tokens`. */
export function NoteLine(props: { readonly color: RoleColor; readonly text: string }) {
  return <text fg={props.color("text.faint")}>{props.text}</text>;
}
