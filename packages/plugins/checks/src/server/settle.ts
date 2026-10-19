/**
 * Settling: when the model ends its turn with changes no report covers, the checks run. A failure
 * goes back to the model as a message a few times; a pass, or one failure too many, ends the turn.
 */

import { Clock, Effect, Option } from "effect";

import type { TurnEndingHook } from "@liminal/agent-loop/contract";
import { draft, type EntryDraft, type SessionId } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { LongOutput } from "@liminal/tool-output/contract";

import { type CheckReport, hasFailures, ReportEntry, reportText } from "../contract.ts";
import { makeChecksFile } from "./file.ts";
import { changesOfTurn, failedReports, isDue, thisTurn } from "./history.ts";
import { makePassed } from "./passed.ts";
import { makeRunner } from "./run.ts";
import { withNextStep } from "./tool.ts";

/** How many failed reports go back to the model before the turn ends. */
const MAX_SEND_BACKS = 3;

const summaryOf = (report: CheckReport) =>
  hasFailures(report)
    ? `Checks failed: ${report.failed.map(({ name }) => name).join(", ")}`
    : "Checks passed";

export const makeSettle = Effect.gen(function* () {
  const log = yield* SessionLog;
  const output = yield* LongOutput;
  const { load } = yield* makeChecksFile;
  const { dueChecks } = yield* makeRunner;
  const { plan } = yield* makePassed;

  const reportDraft = Effect.fn("Checks.reportDraft")(function* (
    session: SessionId,
    report: CheckReport,
  ) {
    const failed = hasFailures(report);
    const whole = `The project's checks ran on this turn's changes.\n\n${withNextStep(reportText(report), failed)}`;
    const now = yield* Clock.currentTimeMillis;
    const text = yield* output.fit(session, `checks-${now}`, whole);

    return draft(ReportEntry, {
      data: report,
      model: [{ role: "user", parts: [{ type: "text", text, providerData: {} }] }],
      text: summaryOf(report),
    });
  });

  const settle = Effect.fn("Checks.settle")(function* (session: SessionId) {
    const checks = yield* load();
    if (Option.isNone(checks)) return [];

    const turn = thisTurn(yield* log.read(session, {}));
    if (!isDue(turn)) return [];

    const due = yield* dueChecks(checks.value.check, checks.value.root, changesOfTurn(turn));
    if (due.length === 0) return [];

    const planned = yield* plan(session, due, checks.value.root);
    if (planned.count === 0) return [];

    const report = yield* planned.run;
    const drafted = yield* reportDraft(session, report);
    const isOutOfTries = failedReports(turn) >= MAX_SEND_BACKS;
    if (hasFailures(report) && !isOutOfTries) return [drafted];

    yield* log.append(session, [drafted]);

    return [];
  });

  const hook: TurnEndingHook = ({ sessionId }) =>
    settle(sessionId).pipe(
      Effect.catch((error) =>
        Effect.as(Effect.logWarning("checks could not settle the turn", error), []),
      ),
      Effect.map((drafts): ReadonlyArray<EntryDraft> => drafts),
    );

  return hook;
});
