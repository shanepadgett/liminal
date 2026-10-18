/** Edit tool's server: registers `edit`, which replaces text in files in the workspace. */

import { Effect, FileSystem, Layer, Path, Result } from "effect";

import { defineTool, Directories, ToolFailed } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

import { EditParams } from "./contract.ts";

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

const editTool = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workspace } = yield* Directories;

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
        const target = path.resolve(workspace, file);
        const content = yield* fs.readFileString(target);

        const edited = yield* Effect.fromResult(
          Result.mapError(replaceOnce(content, oldText, newText), failed),
        );

        yield* fs.writeFileString(target, edited);

        return { result: `edited ${file}` };
      }).pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(failed(error.message)))),
  });
});

export const layer = Layer.effectDiscard(
  Effect.flatMap(editTool, (tool) => Effect.flatMap(Tools, (tools) => tools.register(tool))),
);
