/** The `edit` tool: replaces text that appears exactly once in a file. */

import { Effect, Result } from "effect";

import { WorkspaceFiles } from "@liminal/files/contract";
import { defineTool, ToolFailed } from "@liminal/sdk";

import { EditParams } from "../contract.ts";

/** `content` with its one `oldText` replaced, or why it cannot be. */
const replaceOnce = (
  content: string,
  oldText: string,
  newText: string,
): Result.Result<string, string> => {
  const count = content.split(oldText).length - 1;
  if (count === 0) return Result.fail("oldText does not appear in the file");

  if (count > 1) {
    return Result.fail(`oldText appears ${count} times; include more text so it appears once`);
  }

  return Result.succeed(content.replace(oldText, () => newText));
};

const failed = (message: string) => new ToolFailed({ message });

export const editTool = Effect.gen(function* () {
  const files = yield* WorkspaceFiles;

  return defineTool({
    name: "edit",
    description: "Replaces text that appears exactly once in a file.",
    parameters: EditParams,
    guidance: [
      "Read a file before changing it, so the change matches what is there now.",
      "Keep `oldText` as short as it can be while still appearing only once in the file.",
    ],
    hints: { openWorldHint: false },
    runAlongside: false,
    safeToRerun: false,
    run: ({ path: file, oldText, newText }) =>
      Effect.gen(function* () {
        const content = yield* files.read(file);

        const edited = yield* Effect.fromResult(
          Result.mapError(replaceOnce(content, oldText, newText), failed),
        );

        yield* files.write(file, edited);

        return { result: `edited ${file}` };
      }).pipe(Effect.catchTag("FileFailed", (error) => Effect.fail(failed(error.message)))),
  });
});
