/**
 * Processes' TUI part: the `process_*` rows, the live last lines of a started command, the
 * sidebar's Processes section and the notice line.
 */

import { Effect } from "effect";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import { defineTui, makeBridge, TuiHost } from "@liminal/sdk/tui";

import { NoticeEntry, type ProcessSummary, ProcessesRpcs, processTools } from "./contract.ts";
import { processRows } from "./tui/rows.ts";
import { makeSection, makeStartDetail, NoticeLine, TextDetail } from "./tui/views.tsx";

/** After compaction's section. */
const SECTION_ORDER = 30;

const NONE: ReadonlyArray<ProcessSummary> = [];

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const client = yield* host.client(ProcessesRpcs);

    const watchOutput = (session: SessionId, id: string, initial: string) =>
      bridge.watch(client["processes/output"]({ session, id }), initial);

    const watchList = (session: SessionId) =>
      bridge.watch(client["processes/list"]({ session }), NONE);

    const StartDetail = makeStartDetail(watchOutput);

    yield* Effect.forEach(
      processRows,
      ([name, rows]) =>
        host.register(
          ChatSlots.tool,
          { key: name, meta: rows },
          name === processTools.start ? StartDetail : TextDetail,
        ),
      { discard: true },
    );

    yield* host.register(ChatSlots.entry, { key: NoticeEntry.kind, meta: {} }, NoticeLine);

    yield* host.register(
      ChatSlots.sidebar,
      { id: "processes", order: SECTION_ORDER },
      makeSection(watchList),
    );
  }),
});
