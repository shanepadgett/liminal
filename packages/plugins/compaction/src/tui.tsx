/**
 * Compaction's TUI part: the checkpoint rule, the handoff and note lines in the debug view, no row
 * for the `checkpoint` call, which the rule stands for, `Recalled entries 12–40` for `history`, and
 * the sidebar's Compaction section.
 */

import { Effect, Option, Schema, Stream } from "effect";

import { ChatSlots, ToolRows } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import { defineTui, makeBridge, Tail, TuiHost } from "@liminal/sdk/tui";

import {
  CheckpointEntry,
  checkpointTool,
  CompactionRpcs,
  type CompactionStatus,
  HandoffEntry,
  HistoryParams,
  historyTool,
  NoteEntry,
} from "./contract.ts";
import { Checkpoint } from "./tui/Checkpoint.tsx";
import { HandoffLine, NoteLine } from "./tui/DebugLine.tsx";
import { makeSection } from "./tui/Section.tsx";

const decodeRange = Schema.decodeUnknownOption(HistoryParams);

const historyRows = ToolRows.Rows({
  fold: (call) => ({
    verb: call.outcome === undefined ? "Recalling" : "Recalled",
    subject: Option.match(decodeRange(call.params), {
      onNone: () => "entries",
      onSome: ({ from, through }) => `entries ${from}–${through}`,
    }),
  }),
});

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.entry, { key: CheckpointEntry.kind, meta: {} }, Checkpoint);
    yield* host.register(ChatSlots.entry, { key: HandoffEntry.kind, meta: {} }, HandoffLine);
    yield* host.register(ChatSlots.entry, { key: NoteEntry.kind, meta: {} }, NoteLine);

    yield* host.register(
      ChatSlots.tool,
      { key: checkpointTool, meta: ToolRows.Hidden() },
      (props) => <Tail text={props.text} lines={4} />,
    );

    yield* host.register(ChatSlots.tool, { key: historyTool, meta: historyRows }, Tail);

    const bridge = yield* makeBridge;
    const client = yield* host.client(CompactionRpcs);

    const watch = (session: SessionId) =>
      bridge.watch(
        client["compaction/status"]({ session }).pipe(Stream.map(Option.some)),
        Option.none<CompactionStatus>(),
      );

    yield* host.register(ChatSlots.sidebar, { id: "compaction", order: 20 }, makeSection(watch));
  }),
});
