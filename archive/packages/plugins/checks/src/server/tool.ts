/**
 * The `checks` tool, which the model has only while the project has `check` commands. Before each
 * model call the checks file is read again, and the tool is registered, changed or removed to
 * match.
 */

import { Effect, Option, Schema, ScopedRef, Semaphore } from "effect";

import { BeforeCall, type BeforeCallHook } from "@liminal/agent-loop/contract";
import { defineTool, type SessionId, ToolFailed } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { LongOutput } from "@liminal/tool-output/contract";
import { Tools } from "@liminal/tools/contract";

import { checksTool, hasFailures, reportText } from "../contract.ts";
import { makeChecksFile, type ProjectChecks } from "./file.ts";
import { changesOfTurn, thisTurn } from "./history.ts";
import { makePassed } from "./passed.ts";
import { makeRunner } from "./run.ts";

const NOTHING_TO_CHECK = "No checks apply to the changes in this run.";

const FIX_AND_CHECK_AGAIN =
  "Fix the reported problems directly, then call checks again before your final message. Ask the user only if fixing a failure needs a change to the checks themselves, such as their configuration, rules or suppressions.";

const CHECK_AGAIN_AFTER_EDIT = "If you change any file after this, call checks again.";

/** No params; a record of nothing is the JSON Schema `type: object` every provider takes. */
const NoParams = Schema.Record(Schema.String, Schema.Never);

const proceed = BeforeCall.Proceed({ input: [] });

/** The report, then what the model does next. */
export const withNextStep = (text: string, failed: boolean): string =>
  `${text}\n\n${failed ? FIX_AND_CHECK_AGAIN : CHECK_AGAIN_AFTER_EDIT}`;

const descriptionOf = (checks: ProjectChecks) =>
  [
    "Runs the project's checks on the files changed since the user's last message, and gives each check that passed and the output of each that failed. A check that already passed on the same files is not run again and is reported as passed earlier. The checks are:",
    "",
    ...checks.check.map(({ name, details }) =>
      Option.match(details, { onNone: () => `- ${name}`, onSome: (text) => `- ${name}: ${text}` }),
    ),
    "",
    "Call it last: it is the final action before your final summary. A completed call counts as current whether the checks pass or fail. Any later call that can write, even one that changes nothing, makes the result stale; finish that work and call checks again. Fix failures yourself. This tool is the only way to run checks, period. Never run one any other way, even in part. If a check you want is not listed, work it out with the user and add it to the checks file.",
  ].join("\n");

/**
 * Reaches the model through the system prompt, where the tool's description is easiest to skim
 * past.
 */
const GUIDANCE = [
  "The `checks` tool is the only way to run checks, period. Never run a check by any command, tool or script, whole or in part, for any reason.",
  "If a check you want to run does not exist, do not run it yourself: work it out with the user first and add it to the checks file. Write the code, fix what `checks` reports, and call it last.",
];

export const makeChecksTool = Effect.gen(function* () {
  const log = yield* SessionLog;
  const output = yield* LongOutput;
  const tools = yield* Tools;
  const { load } = yield* makeChecksFile;
  const { dueChecks } = yield* makeRunner;
  const { plan } = yield* makePassed;

  const run = Effect.fn("Checks.tool")(function* (sessionId: SessionId, callId: string) {
    const checks = yield* load();
    if (Option.isNone(checks)) return { result: "This project has no checks." };

    const entries = yield* log.read(sessionId, {});
    const { check, root } = checks.value;
    const due = yield* dueChecks(check, root, changesOfTurn(thisTurn(entries)));
    if (due.length === 0) return { result: NOTHING_TO_CHECK };

    const planned = yield* plan(sessionId, due, root);
    const report = yield* planned.run;
    const failed = hasFailures(report);
    const text = yield* output.fit(sessionId, callId, withNextStep(reportText(report), failed));

    if (failed) return yield* new ToolFailed({ message: text, details: report });

    return { result: text, details: report };
  });

  const toolOf = (checks: ProjectChecks) =>
    defineTool({
      name: checksTool,
      description: descriptionOf(checks),
      guidance: GUIDANCE,
      parameters: NoParams,
      hints: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      runAlongside: false,
      safeToRerun: true,
      run: (_params, { sessionId, callId }) =>
        run(sessionId, callId).pipe(
          Effect.catchTags({
            ChecksFileInvalid: (error) => Effect.fail(new ToolFailed({ message: error.message })),
            SessionNotFound: (error) => Effect.fail(new ToolFailed({ message: error.message })),
            StoreError: (error) => Effect.fail(new ToolFailed({ message: error.message })),
          }),
        ),
    });

  /** The registered tool's description; empty while none is registered. */
  const registered = yield* ScopedRef.make(() => "");
  const lock = yield* Semaphore.make(1);

  const follow = Effect.fn("Checks.followFile")(function* () {
    const checks = yield* load().pipe(Effect.orElseSucceed(() => Option.none<ProjectChecks>()));
    const wanted = Option.filter(checks, ({ check }) => check.length > 0);
    const description = Option.match(wanted, { onNone: () => "", onSome: descriptionOf });
    if (description === (yield* ScopedRef.get(registered))) return;

    yield* ScopedRef.set(
      registered,
      Option.match(wanted, {
        onNone: () => Effect.succeed(""),
        onSome: (found) => Effect.as(tools.register(toolOf(found)), description),
      }),
    );
  });

  /** A before-call hook that keeps the tool in step with the checks file. */
  const followFile: BeforeCallHook = () => lock.withPermit(Effect.as(follow(), proceed));

  yield* follow();

  return { followFile };
});
