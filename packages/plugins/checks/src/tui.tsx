/**
 * Checks' TUI part: the `checks` tool's rows, the report a settled turn saved, and the fixer line
 * in the debug view.
 */

import { Effect, Option, Schema } from "effect";

import { ChatSlots, ToolRows } from "@liminal/chat/contract";
import { defineTui, TuiHost } from "@liminal/sdk/tui";

import { CheckReport, checksTool, FixedEntry, ReportEntry } from "./contract.ts";
import { ChecksDetail, FixedLine, ReportRow } from "./tui/ChecksView.tsx";

const decodeReport = Schema.decodeUnknownOption(CheckReport);

const checksRows = ToolRows.Rows({
  fold: (call) => {
    if (call.outcome === undefined) return { verb: "Running", subject: "checks" };

    // A call with no report, such as one with nothing to check, has no detail.
    const detail = Option.match(decodeReport(call.outcome.details), {
      onNone: () => "",
      onSome: (report) =>
        report.failed.length === 0
          ? "all passed"
          : report.failed.map(({ name }) => name).join(", "),
    });

    return { verb: "Ran", subject: "checks", detail };
  },
});

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: checksTool, meta: checksRows }, ChecksDetail);
    yield* host.register(ChatSlots.entry, { key: ReportEntry.kind, meta: {} }, ReportRow);
    yield* host.register(ChatSlots.entry, { key: FixedEntry.kind, meta: {} }, FixedLine);
  }),
});
