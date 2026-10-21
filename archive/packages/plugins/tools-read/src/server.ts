/** Read tool's server: registers `read`, which reads files in the workspace. */

import { Effect, Layer } from "effect";

import { WorkspaceFiles } from "@liminal/files/contract";
import { defineTool, ToolFailed } from "@liminal/sdk";
import { Tools } from "@liminal/tools/contract";

import { lineWindow, ReadParams } from "./contract.ts";

/** Lines `read` returns when the model sets no limit. */
const defaultLimit = 2000;

const readTool = Effect.gen(function* () {
  const files = yield* WorkspaceFiles;

  return defineTool({
    name: "read",
    description: "Reads a text file. Long files come back in windows of lines.",
    parameters: ReadParams,
    guidance: [
      "Use `read` to look at a file, not `cat`, `head` or `tail` through a shell.",
      "Read a file before changing it, so the change matches what is there now.",
    ],
    hints: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    runAlongside: true,
    safeToRerun: true,
    run: ({ path: file, offset = 1, limit = defaultLimit }) =>
      files.read(file).pipe(
        Effect.mapError((error) => new ToolFailed({ message: error.message })),
        Effect.map((content) => ({ result: lineWindow(content, offset, limit) })),
      ),
  });
});

export const layer = Layer.effectDiscard(
  Effect.flatMap(readTool, (tool) => Effect.flatMap(Tools, (tools) => tools.register(tool))),
);
