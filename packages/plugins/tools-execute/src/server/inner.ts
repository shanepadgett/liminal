/**
 * A script's functions: each registered tool, called through the tool pipeline as an inner call of
 * the `execute` call, with its outcome saved for the transcript.
 */

import { Tool as ScriptTool, type ToolError, toolError } from "@opencode/codemode";
import { Effect, Option, Predicate, Ref, Schema, Semaphore } from "effect";

import { draft, type SessionId, type Tool } from "@liminal/sdk";
import { InnerCallEntry, type SessionLog } from "@liminal/session-log/contract";
import type { ToolCall, ToolOutcome, ToolPipeline, Tools } from "@liminal/tools/contract";

export interface InnerDeps {
  readonly tools: Tools["Service"];
  readonly pipeline: ToolPipeline["Service"];
  readonly log: SessionLog["Service"];
}

const decodeJson = Schema.decodeUnknownEffect(Schema.Json);

/**
 * A tool's params as codemode reads them: a JSON Schema object. Codemode only draws the script's
 * signature from it, so any object will do.
 */
const isJsonSchema = (params: unknown): params is ScriptTool.JsonSchema =>
  Predicate.isObject(params) && !Array.isArray(params);

/** What the transcript keeps of an inner call. */
const innerDraft = (call: ToolCall, outer: string, outcome: ToolOutcome) => {
  const ended =
    outcome.status === "done"
      ? { status: outcome.status, result: outcome.output.result, details: outcome.output.details }
      : { status: outcome.status, result: outcome.message, details: outcome.details };

  const data = { outer, id: call.callId, name: call.name, params: call.params };
  const { details, ...rest } = ended;

  return draft(InnerCallEntry, {
    data: details === undefined ? { ...data, ...rest } : { ...data, ...rest, details },
    text: `${call.name}: ${outcome.status}`,
  });
};

const failure = (outcome: ToolOutcome): Effect.Effect<Schema.Json, ToolError> =>
  outcome.status === "done"
    ? Effect.succeed(outcome.output.result)
    : Effect.fail(toolError(`${outcome.status}: ${outcome.message}`));

/** The functions of one script run by the `execute` call `outer` in `session`. */
export const makeFunctions = Effect.fn("ToolsExecute.functions")(function* (
  deps: InnerDeps,
  session: SessionId,
  outer: string,
) {
  const count = yield* Ref.make(0);
  // Tools that cannot run alongside others take turns, as the model's own calls do.
  const serial = yield* Semaphore.make(1);

  const call = (tool: Tool, params: Schema.Json) =>
    Effect.gen(function* () {
      const index = yield* Ref.updateAndGet(count, (n) => n + 1);

      const inner: ToolCall = {
        sessionId: session,
        callId: `${outer}/${index}`,
        name: tool.spec.name,
        params,
        outer,
      };

      const run = deps.pipeline.run(inner, Option.some(tool));
      const outcome = yield* tool.runAlongside ? run : serial.withPermits(1)(run);

      yield* deps.log
        .append(session, [innerDraft(inner, outer, outcome)])
        .pipe(Effect.catch((error) => Effect.logWarning("an inner call was not saved", error)));

      return yield* failure(outcome);
    });

  const all = yield* deps.tools.list;

  return Object.fromEntries(
    all.flatMap((tool) => {
      const { name, description, parameters } = tool.spec;

      // Checks must be the model's final direct call so their report has its own transcript row.
      if (name === "execute" || name === "checks") return [];

      const made = ScriptTool.make({
        description,
        input: isJsonSchema(parameters) ? parameters : {},
        output: {},
        execute: (input) =>
          decodeJson(input).pipe(
            Effect.mapError((error) => toolError(error.message)),
            Effect.flatMap((params) => call(tool, params)),
          ),
      });

      return [[name, made] as const];
    }),
  );
});
