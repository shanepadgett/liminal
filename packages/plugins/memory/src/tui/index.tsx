/**
 * Memory's `tui` entry: memory rows and checkpoint rows in the transcript, the `checkpoint` tool's
 * own row hidden, and the Memory section in chat's sidebar from the session's first memory.
 */
import { Effect, Layer, Option, Stream } from "effect";
import { Show } from "solid-js";

import {
  ItemRenderer,
  sidebar,
  type SidebarProps,
  ToolRows,
  ToolRowView,
} from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import type { SessionEvent, SessionId } from "@shanepadgett/liminal-session/contract";
import { kit, Slots, useColor, useWatch } from "@shanepadgett/liminal-tui";

import {
  CheckpointMade,
  checkpointName,
  Covers,
  MemoryRpc,
  type MemoryStatus,
  MemoryWritten,
} from "../contract.ts";

/** A hollow star over entries, a solid one over compacted memories. */
const starOf = Covers.match({ Entries: () => "✧", Memories: () => "✦" });

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** A memory where it was written: its star and its line, in the model's voice. */
function MemoryRow(props: { readonly event: SessionEvent }) {
  const color = useColor();

  const memory = () => Option.getOrUndefined(MemoryWritten.decodeOption(props.event));

  return (
    <Show when={memory()}>
      {(shown) => (
        <text flexShrink={0}>
          <span style={{ fg: color("text.accent") }}>{`${starOf(shown().covers)} `}</span>
          <i style={{ fg: color("text.base") }}>{shown().line}</i>
        </text>
      )}
    </Show>
  );
}

/** Where the model's context starts over, and how many files it read back in. */
function CheckpointRow(props: { readonly event: SessionEvent }) {
  const color = useColor();

  const files = () =>
    Option.match(CheckpointMade.decodeOption(props.event), {
      onNone: () => 0,
      onSome: ({ files: read }) => read.length,
    });

  return (
    <text flexShrink={0}>
      <span style={{ fg: color("feedback.info") }}>↺ </span>
      <span style={{ fg: color("text.base"), bold: true }}>Checkpoint</span>
      <span style={{ fg: color("text.faint") }}>
        {files() === 0 ? "" : ` · ${files()} ${plural(files(), "file", "files")} read`}
      </span>
    </text>
  );
}

const statusOf = (session: SessionId) =>
  Stream.unwrap(
    Effect.map(
      Effect.flatMap(Host, (host) => host.client(MemoryRpc)),
      (client) => client["memory/status"]({ session }),
    ),
  );

const NOTHING_YET: MemoryStatus = { memories: 0, checkpoints: 0, writing: false };

/** A count and the faint words after it. */
function Count(props: { readonly count: number; readonly one: string; readonly many: string }) {
  const color = useColor();

  return (
    <text wrapMode="none">
      <span style={{ fg: color("text.muted") }}>{String(props.count)}</span>
      <span style={{ fg: color("text.faint") }}>
        {` ${plural(props.count, props.one, props.many)}`}
      </span>
    </text>
  );
}

function SessionMemory(props: { readonly session: SessionId }) {
  const status = useWatch(statusOf(props.session), NOTHING_YET);
  const started = () => status().memories > 0 || status().checkpoints > 0 || status().writing;

  return (
    <Show when={started()}>
      <kit.Section title="Memory" note={status().writing ? "writing" : undefined}>
        <Count count={status().memories} one="memory" many="memories" />
        <Count count={status().checkpoints} one="checkpoint" many="checkpoints" />
      </kit.Section>
    </Show>
  );
}

/** A new session on screen follows that session's memory. */
function MemorySection(props: SidebarProps) {
  return (
    <Show when={props.session} keyed>
      {(session) => <SessionMemory session={session} />}
    </Show>
  );
}

const make = Effect.gen(function* () {
  const renderers = yield* ItemRenderer;
  yield* renderers.add({ kind: MemoryWritten.kind, component: MemoryRow });
  yield* renderers.add({ kind: CheckpointMade.kind, component: CheckpointRow });
  yield* (yield* ToolRows).add(ToolRowView.Hidden({ tool: checkpointName }));
  yield* (yield* Slots).fill(sidebar, MemorySection);
});

export default definePlugin({
  name: "memory-tui",
  provides: [],
  requires: [ItemRenderer, ToolRows, Slots],
  layer: Layer.effectDiscard(make),
});
