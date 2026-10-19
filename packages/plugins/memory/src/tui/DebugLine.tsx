/**
 * Memory's lines: the handoff the model wrote, in the debug view, folded to its first line until
 * clicked, and one faint line per note or memory with its range and size.
 */

import { Option, Schema } from "effect";
import { createSignal, Show } from "solid-js";

import type { SavedEntry } from "@liminal/sdk";
import { useColor } from "@liminal/sdk/tui";

import { HandoffEntry } from "../contract.ts";

const decodeHandoff = Schema.decodeUnknownOption(HandoffEntry.data);

/** The handoff's first line, shown while it is folded. */
const firstLine = (text: string): string => text.split("\n", 1)[0] ?? "";

export function HandoffLine(props: { readonly entry: SavedEntry }) {
  const color = useColor();
  const [isFolded, setFolded] = createSignal(true);

  const handoff = () =>
    Option.match(decodeHandoff(props.entry.data), {
      onNone: () => props.entry.text,
      onSome: (data) => data.handoff,
    });

  const head = () =>
    `${isFolded() ? "▸" : "▾"} Handoff${isFolded() ? `  ${firstLine(handoff())}` : ""}`;

  return (
    <box flexDirection="column" onMouseUp={() => setFolded(!isFolded())}>
      <text wrapMode="none" fg={color("text.faint")}>
        {head()}
      </text>
      <Show when={!isFolded()}>
        <box paddingLeft={2}>
          <text fg={color("text.faint")}>{handoff()}</text>
        </box>
      </Show>
    </box>
  );
}

/** `Short-term note, entries 121–160, 1,840 tokens`, as the writer saved it. */
export function NoteLine(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  return <text fg={color("text.faint")}>{props.entry.text}</text>;
}
