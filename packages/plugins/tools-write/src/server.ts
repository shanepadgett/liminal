/** Write tool's server: registers `write`, which writes whole files in the workspace. */

import { Effect, FileSystem, Layer, Path } from "effect";

import { defineTool, Directories, ToolFailed } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

import { WriteParams } from "./contract.ts";

const writeTool = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workspace } = yield* Directories;

  return defineTool({
    name: "write",
    description: "Writes a whole file, creating it and its folders if needed.",
    parameters: WriteParams,
    guidance: ["Use `write` only for a new file or a whole rewrite; use `edit` for a change."],
    hints: { idempotentHint: true, openWorldHint: false },
    runAlongside: false,
    safeToRerun: true,
    run: ({ path: file, content }) =>
      Effect.gen(function* () {
        const target = path.resolve(workspace, file);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(target, content);

        return { result: `wrote ${file}` };
      }).pipe(Effect.mapError((error) => new ToolFailed({ message: error.message }))),
  });
});

export const layer = Layer.effectDiscard(
  Effect.flatMap(writeTool, (tool) => Effect.flatMap(Tools, (tools) => tools.register(tool))),
);
