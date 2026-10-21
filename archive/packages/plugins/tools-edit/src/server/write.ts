/** The `write` tool: writes a whole file, making its folders. */

import { Effect } from "effect";

import { WorkspaceFiles } from "@liminal/files/contract";
import { defineTool, ToolFailed } from "@liminal/sdk";

import { WriteParams } from "../contract.ts";

export const writeTool = Effect.gen(function* () {
  const files = yield* WorkspaceFiles;

  return defineTool({
    name: "write",
    description: "Writes a whole file, creating it and its folders if needed.",
    parameters: WriteParams,
    guidance: ["Use `write` only for a new file or a whole rewrite; use `edit` for a change."],
    hints: { idempotentHint: true, openWorldHint: false },
    runAlongside: false,
    safeToRerun: true,
    run: ({ path: file, content }) =>
      files.write(file, content).pipe(
        Effect.map(() => ({ result: `wrote ${file}` })),
        Effect.mapError((error) => new ToolFailed({ message: error.message })),
      ),
  });
});
