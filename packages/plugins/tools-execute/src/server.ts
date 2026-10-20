/**
 * Execute tool's server: registers `execute`, whose script functions are the other registered
 * tools.
 */

import { Duration, Effect, Layer } from "effect";

import { defineTool, ToolFailed } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { ToolPipeline, Tools } from "@liminal/tools/contract";

import { ExecuteParams } from "./contract.ts";
import { makeFunctions } from "./server/inner.ts";
import { executeScript } from "./server/script.ts";

const description = [
  "Executes a JavaScript program whose functions are your other tools: `await tools.<name>(params)` calls the tool `<name>` with the same params and returns its result, or throws its failure.",
  "The `execute` and `checks` tools are unavailable inside scripts. Call `checks` directly as your final action before the summary.",
  'Use bracket notation for a name that is not an identifier, as in `tools["my-tool"](params)`.',
  "Deferred tools are callable too; `search({ query })` lists tools by keyword and runs without await.",
  "Only what the program prints with console.log and the value it returns come back. Imports, timers and direct file or network access are unavailable.",
  "Await every call that matters; calls still running when the program ends are stopped. Use Promise.all for calls that do not depend on each other.",
].join("\n");

const guidance = [
  "Use `execute` when one program saves steps or tokens: chaining calls, looping over files, or filtering long results before you read them. Call a single tool directly.",
];

const make = Effect.gen(function* () {
  const tools = yield* Tools;
  const deps = { tools, pipeline: yield* ToolPipeline, log: yield* SessionLog };

  yield* tools.register(
    defineTool({
      name: "execute",
      description,
      parameters: ExecuteParams,
      guidance,
      runAlongside: false,
      safeToRerun: false,
      run: ({ code, timeout }, { sessionId, callId }) =>
        Effect.gen(function* () {
          const functions = yield* makeFunctions(deps, sessionId, callId);
          const ran = yield* executeScript(code, functions, Duration.seconds(timeout));
          if (ran.isFailure) return yield* new ToolFailed({ message: ran.text });

          return { result: ran.text };
        }),
    }),
  );
});

export const layer = Layer.effectDiscard(make);
