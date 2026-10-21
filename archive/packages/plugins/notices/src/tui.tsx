/** Notices' TUI part: draws notice entries in the chat transcript. */

import { Effect } from "effect";

import { ChatSlots } from "@liminal/chat/contract";
import { defineTui, TuiHost } from "@liminal/sdk/tui";

import { NoticeEntry } from "./contract.ts";
import { NoticeEntryView } from "./tui/Notice.tsx";

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.entry, { key: NoticeEntry.kind, meta: {} }, NoticeEntryView);
  }),
});
