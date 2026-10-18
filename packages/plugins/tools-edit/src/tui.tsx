/**
 * The file-changing tools' TUI part: calls read as `Edited <path>` and `Wrote <path>`, and join
 * into `Edited N files`; an opened row shows the end of the result.
 */

import { Effect } from "effect";

import { ChatSlots, pathRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

const joins = { verb: "Edited", noun: "files" };
const editRows = pathRows({ running: "Editing", done: "Edited", joins });
const writeRows = pathRows({ running: "Writing", done: "Wrote", joins });

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    yield* host.register(ChatSlots.tool, { key: "edit", meta: editRows }, Tail);
    yield* host.register(ChatSlots.tool, { key: "write", meta: writeRows }, Tail);
  }),
});
