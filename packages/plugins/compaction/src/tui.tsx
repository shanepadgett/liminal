/**
 * Compaction's TUI part: the checkpoint rule, the handoff and note lines in the debug view, and no
 * row for the `checkpoint` call, which the rule stands for.
 */

import { Effect } from "effect";

import { ChatSlots, ToolRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

import { CheckpointEntry, checkpointTool, HandoffEntry, NoteEntry } from "./contract.ts";
import { Checkpoint } from "./tui/Checkpoint.tsx";
import { HandoffLine, NoteLine } from "./tui/DebugLine.tsx";

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
  }),
});
