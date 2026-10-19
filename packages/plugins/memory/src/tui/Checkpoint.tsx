/**
 * A checkpoint in the transcript: a faint rule across it with "Checkpoint" in its middle, and how
 * many files it read back, if any: "Checkpoint · 6 files read". Every trigger draws the same rule;
 * the transcript's gaps give it a blank line above and below.
 */

import { Option, Schema } from "effect";

import type { SavedEntry } from "@liminal/sdk";
import { type RoleColor, useColor } from "@liminal/sdk/tui";

import { CheckpointData } from "../contract.ts";

const decodeCheckpoint = Schema.decodeUnknownOption(CheckpointData);

/** `Checkpoint`, then how many files it read back, if any. */
const labelOf = (restored: number): string =>
  restored === 0
    ? " Checkpoint "
    : ` Checkpoint · ${restored} ${restored === 1 ? "file" : "files"} read `;

/** One stretch of the rule: a box whose only border is its top edge. */
function Rule(props: { readonly color: RoleColor }) {
  return (
    <box flexGrow={1} height={1} border={["top"]} borderColor={props.color("border.subtle")} />
  );
}

export function Checkpoint(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  const restored = () =>
    Option.match(decodeCheckpoint(props.entry.data), {
      onNone: () => 0,
      onSome: (data) => data.restored,
    });

  return (
    <box flexDirection="row">
      <Rule color={color} />
      {/* A text at a half column is drawn a column left of where the rules end; a box rounds like them. */}
      <box flexShrink={0}>
        <text fg={color("text.ghost")}>{labelOf(restored())}</text>
      </box>
      <Rule color={color} />
    </box>
  );
}
