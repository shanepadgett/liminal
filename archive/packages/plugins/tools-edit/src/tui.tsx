/**
 * The file-changing tools' TUI part: calls read as `Edit <path>` and `Write <path>`, and join into
 * `Edit N files`; an opened row shows the end of the result.
 */

import { Effect } from "effect";

import { ChatSlots, pathRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

const joins = { label: "Edit", noun: "files" };
const editRows = pathRows({ label: "Edit", joins });
const writeRows = pathRows({ label: "Write", joins });

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    yield* host.register(ChatSlots.tool, { key: "edit", meta: editRows }, Tail);
    yield* host.register(ChatSlots.tool, { key: "write", meta: writeRows }, Tail);
  }),
});
