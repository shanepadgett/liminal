/**
 * Memory's lines: the handoff the model wrote, in the debug view, folded to its first line until
 * clicked, the files a checkpoint read back, folded to one line until clicked, and one faint line
 * per short-term or long-term memory with its range and size.
 */

import { Option, Schema } from "effect";
import { createSignal, For, Show } from "solid-js";

import type { SavedEntry } from "@liminal/sdk";
import { useColor } from "@liminal/sdk/tui";

import { HandoffEntry, type LineRange, RestoredEntry } from "../contract.ts";

const decodeHandoff = Schema.decodeUnknownOption(HandoffEntry.data);
const decodeRestored = Schema.decodeUnknownOption(RestoredEntry.data);

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

/** `1–180, 260–318`, or `all` for a file read whole. */
const linesText = (ranges: ReadonlyArray<LineRange>) =>
  ranges.length === 0 ? "all" : ranges.map((range) => `${range.from}–${range.through}`).join(", ");

/** `▸ Files 4 read, 1 left out`; unfolded, each file with its lines, then those left out. */
export function RestoredLine(props: { readonly entry: SavedEntry }) {
  const color = useColor();
  const [isFolded, setFolded] = createSignal(true);

  const restored = () =>
    Option.getOrElse(decodeRestored(props.entry.data), () => ({ files: [], leftOut: [] }));

  const summary = () => {
    const read = `${restored().files.length} read`;
    const left = restored().leftOut.length;

    return left === 0 ? read : `${read}, ${left} left out`;
  };

  return (
    <box flexDirection="column" onMouseUp={() => setFolded(!isFolded())}>
      <text wrapMode="none" fg={color("text.faint")}>
        {`${isFolded() ? "▸" : "▾"} Files  ${summary()}`}
      </text>
      <Show when={!isFolded()}>
        <box paddingLeft={2} flexDirection="column">
          <For each={restored().files}>
            {(file) => (
              <text wrapMode="none" fg={color("text.faint")}>
                {`${file.path}  ${linesText(file.ranges)}`}
              </text>
            )}
          </For>
          <For each={restored().leftOut}>
            {(path) => (
              <text wrapMode="none" fg={color("text.ghost")}>
                {`${path}  left out`}
              </text>
            )}
          </For>
        </box>
      </Show>
    </box>
  );
}

/** `Short-term memory, entries 121–160, 1,840 tokens`, as the writer saved it. */
export function NoteLine(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  return <text fg={color("text.faint")}>{props.entry.text}</text>;
}
