/**
 * The `write` tool's TUI part: a call reads as `Wrote <path>`. Writes and edits join into `Edited N
 * files`; an opened row shows the end of the result.
 */

import { Effect } from "effect";

import { ChatSlots, pathRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

const rows = pathRows({
  running: "Writing",
  done: "Wrote",
  joins: { verb: "Edited", noun: "files" },
});

export default defineTui({
  setup: Effect.flatMap(TuiHost, (host) =>
    host.register(ChatSlots.tool, { key: "write", meta: rows }, Tail),
  ),
});
