/**
 * The `read` tool's TUI part: a call reads as `Read <path>`. Reads join into `Read N files`; an
 * opened row shows the end of the result.
 */

import { Effect } from "effect";

import { ChatSlots, pathRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

const rows = pathRows({ label: "Read", joins: { label: "Read", noun: "files" } });

export default defineTui({
  setup: Effect.flatMap(TuiHost, (host) =>
    host.register(ChatSlots.tool, { key: "read", meta: rows }, Tail),
  ),
});
