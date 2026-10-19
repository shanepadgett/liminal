/** Session name's TUI part: no row for the `name_session` call; the name shows in `/sessions`. */

import { Effect } from "effect";

import { ChatSlots, ToolRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

import { nameTool } from "./contract.ts";

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: nameTool, meta: ToolRows.Hidden({}) }, (props) => (
      <Tail text={props.text} lines={4} />
    ));
  }),
});
