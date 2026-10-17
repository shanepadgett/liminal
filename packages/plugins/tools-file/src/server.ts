/** File tools' server: registers `read`, `write` and `edit`, working in the workspace folder. */

import { Effect, FileSystem, Layer, Path, Result } from "effect";

import { defineTool, Directories, ToolFailed } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

import { EditParams, ReadParams, WriteParams } from "./contract.ts";

/** Lines `read` returns when the model sets no limit. */
const defaultLimit = 2000;

/** How many times `part` appears in `text`, without overlaps. */
const occurrences = (text: string, part: string) => text.split(part).length - 1;

/** The lines `offset` (from 1) through `offset + limit - 1`, and a note when more follow. */
const window = (content: string, offset: number, limit: number) => {
  const lines = content.split("\n");
  const shown = lines.slice(offset - 1, offset - 1 + limit);
  const last = offset - 1 + shown.length;
  if (last >= lines.length) return shown.join("\n");

  return `${shown.join("\n")}\n[lines ${offset}-${last} of ${lines.length}; read on from offset ${last + 1}]`;
};

/** `content` with its one `oldText` replaced, or why it cannot be. */
const replaceOnce = (
  content: string,
  oldText: string,
  newText: string,
): Result.Result<string, string> => {
  const count = occurrences(content, oldText);
  if (count === 0) return Result.fail("oldText does not appear in the file");

  if (count > 1) {
    return Result.fail(`oldText appears ${count} times; include more text so it appears once`);
  }

  return Result.succeed(content.replace(oldText, () => newText));
};

const failed = (error: { readonly message: string }) => new ToolFailed({ message: error.message });

/** The file system, and a workspace-relative path made absolute. */
interface Files {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly resolve: (file: string) => string;
}

const readTool = ({ fs, resolve }: Files) =>
  defineTool({
    name: "read",
    description: "Reads a text file. Long files come back in windows of lines.",
    parameters: ReadParams,
    hints: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    runAlongside: true,
    safeToRerun: true,
    run: ({ path: file, offset = 1, limit = defaultLimit }) =>
      fs.readFileString(resolve(file)).pipe(
        Effect.mapError(failed),
        Effect.map((content) => ({ result: window(content, offset, limit) })),
      ),
  });

const writeTool = ({ fs, path, resolve }: Files) =>
  defineTool({
    name: "write",
    description: "Writes a whole file, creating it and its folders if needed.",
    parameters: WriteParams,
    hints: { idempotentHint: true, openWorldHint: false },
    runAlongside: false,
    safeToRerun: true,
    run: ({ path: file, content }) =>
      Effect.gen(function* () {
        const target = resolve(file);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(target, content);

        return { result: `wrote ${file}` };
      }).pipe(Effect.mapError(failed)),
  });

const editTool = ({ fs, resolve }: Files) =>
  defineTool({
    name: "edit",
    description: "Replaces text that appears exactly once in a file.",
    parameters: EditParams,
    hints: { openWorldHint: false },
    runAlongside: false,
    safeToRerun: false,
    run: ({ path: file, oldText, newText }) =>
      Effect.gen(function* () {
        const target = resolve(file);
        const content = yield* Effect.mapError(fs.readFileString(target), failed);

        const edited = yield* Effect.fromResult(replaceOnce(content, oldText, newText)).pipe(
          Effect.mapError((message) => new ToolFailed({ message })),
        );

        yield* Effect.mapError(fs.writeFileString(target, edited), failed);

        return { result: `edited ${file}` };
      }),
  });

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tools = yield* Tools;
  const workspace = path.dirname((yield* Directories).project);
  const files: Files = { fs, path, resolve: (file) => path.resolve(workspace, file) };

  yield* tools.register(readTool(files));
  yield* tools.register(writeTool(files));
  yield* tools.register(editTool(files));
});

export const layer = Layer.effectDiscard(make);
