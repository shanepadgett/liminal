/**
 * The reviewer's step: the session provider's small model looks at the call, may read files and run
 * safe commands, and approves it or explains it to the user.
 */

import { Duration, Effect, Option, Schema } from "effect";

import type { CommandRunner } from "@liminal/command-runner/contract";
import type { WorkspaceFiles } from "@liminal/files/contract";
import type { Models, ModelTask } from "@liminal/models/contract";
import { defineTool, ToolFailed } from "@liminal/sdk";
import type { ShellSafety } from "@liminal/shell-safety/contract";
import { ReadParams } from "@liminal/tools-read/contract";
import type { ToolCall } from "@liminal/tools/contract";

import type { Recent } from "./recent.ts";

/** What the reviewer reads and runs with. */
export interface ReviewDeps {
  readonly models: Models["Service"];
  readonly task: ModelTask["Service"];
  readonly files: WorkspaceFiles["Service"];
  readonly runner: CommandRunner["Service"];
  readonly safety: ShellSafety["Service"];
  readonly workspace: string;
}

export const Review = Schema.Struct({
  decision: Schema.Literals(["approved", "ask"]).annotate({
    description: "approved runs the call; ask shows the user your summary and reason",
  }),
  summary: Schema.String.check(Schema.isMaxLength(600)).annotate({
    description: "What the call will do, in everyday words for the user",
  }),
  reason: Schema.String.check(Schema.isMaxLength(300)).annotate({
    description: "Why you approved it, or why the user should decide",
  }),
});

export type Review = typeof Review.Type;

const system = [
  "You review one tool call that a coding agent wants to run for its user.",
  "Approve a call that fits what the user asked for, unless it is both destructive and impossible to undo.",
  "Ask the user when the call changes things the user did not ask for: deleting or overwriting work that cannot be restored, changing files outside the workspace, changing the system, sending data to other machines, or running code you cannot see and could not check.",
  "You may read files and run read-only shell commands to check what the call would do.",
  "Then call submit_review once.",
].join("\n");

/** Most characters of a file the reviewer reads. */
const readLimit = 20_000;

const failed = (message: string) => new ToolFailed({ message });

const tools = (deps: ReviewDeps, safeCommands: ReadonlyArray<string>) => [
  defineTool({
    name: "read",
    description: `Reads a text file; only its first ${readLimit} characters come back.`,
    parameters: Schema.Struct({ path: ReadParams.fields.path }),
    runAlongside: true,
    safeToRerun: true,
    run: ({ path: file }) =>
      deps.files.read(file).pipe(
        Effect.mapError((error) => failed(error.message)),
        Effect.map((content) => ({ result: content.slice(0, readLimit) })),
      ),
  }),
  defineTool({
    name: "shell",
    description: "Runs a read-only command line in the workspace; other commands are refused.",
    parameters: Schema.Struct({ command: Schema.String }),
    runAlongside: false,
    safeToRerun: true,
    run: ({ command }) =>
      deps.safety.isSafe(command, safeCommands)
        ? deps.runner.run({ command, cwd: deps.workspace, timeout: Duration.seconds(20) }).pipe(
            Effect.mapError((error) => failed(error.message)),
            Effect.map((result) => ({
              result: `${result.stdout}${result.stderr}`.slice(0, readLimit),
            })),
          )
        : Effect.fail(failed("only read-only commands run here")),
  }),
];

const promptOf = (call: ToolCall, reason: string, recent: Recent) =>
  JSON.stringify(
    {
      call: { tool: call.name, params: call.params },
      flagged: reason,
      recentUserPrompts: recent.prompts,
      recentAssistantTexts: recent.replies,
    },
    null,
    2,
  );

/** The review, or none when the session has no provider or the review fails. */
export const review = Effect.fn("approval.review")(function* (
  deps: ReviewDeps,
  call: ToolCall,
  reason: string,
  context: { readonly recent: Recent; readonly safeCommands: ReadonlyArray<string> },
) {
  if (Option.isNone(context.recent.provider)) return Option.none<Review>();

  const run = Effect.flatMap(deps.models.cheap(context.recent.provider.value), (model) =>
    deps.task.run({
      model,
      sessionId: call.sessionId,
      system,
      prompt: [
        {
          role: "user",
          parts: [{ type: "text", text: promptOf(call, reason, context.recent), providerData: {} }],
        },
      ],
      tools: tools(deps, context.safeCommands),
      submit: {
        name: "submit_review",
        description: "Gives your review of the call.",
        schema: Review,
      },
      maxSteps: 6,
    }),
  );

  return yield* run.pipe(
    Effect.tapError((error) => Effect.logWarning(`approval review failed: ${error.message}`)),
    Effect.option,
  );
});
