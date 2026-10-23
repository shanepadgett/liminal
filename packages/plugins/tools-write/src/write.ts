/** The `write` tool: a whole file, made or replaced, saved with a patch of the change. */
import { createPatch } from "diff";
import { Effect, FileSystem, Option, Path, Schema } from "effect";

import { Directories } from "@shanepadgett/liminal-directories/contract";
import { SessionLog } from "@shanepadgett/liminal-session/contract";
import { defineTool, ToolFailed, type ToolContext } from "@shanepadgett/liminal-tools/contract";

import { Written, writeName } from "./contract.ts";

const description = `Write a whole file, making it or replacing what it holds. Paths are relative to the workspace, or absolute. Missing folders are made.

To change part of a file that exists, use edit.`;

const Input = Schema.Struct({
  path: Schema.String.annotate({ description: "The file to write." }),
  content: Schema.String.annotate({ description: "Everything the file holds." }),
});

type Input = typeof Input.Type;

/** How many lines `text` holds; a newline at the end starts no line of its own. */
const lineCount = (text: string) =>
  text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

const failed = (message: string) => new ToolFailed({ message });

export const makeWrite = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const log = yield* SessionLog;
  const { workspace } = yield* Directories;

  /** What the file holds now; empty when nothing is there, and a folder fails. */
  const textAt = Effect.fn("write.before")(function* (target: string, shown: string) {
    const info = yield* Effect.option(fs.stat(target));
    if (Option.isNone(info)) return "";
    if (info.value.type === "Directory") return yield* failed(`${shown} is a folder.`);

    return new TextDecoder().decode(yield* fs.readFile(target));
  });

  const run = (input: Input, { session, callId }: ToolContext) =>
    Effect.gen(function* () {
      const target = path.resolve(workspace, input.path);
      const before = yield* textAt(target, input.path);

      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, input.content);

      const patch = createPatch(input.path, before, input.content);
      yield* log.append(session, [yield* Written.make({ callId, path: input.path, patch })]);

      const lines = lineCount(input.content);
      const text = `Wrote ${input.path}: ${lines === 1 ? "1 line" : `${lines} lines`}`;

      return { content: [{ type: "text" as const, text }] };
    }).pipe(Effect.mapError(({ message }) => failed(message)));

  return defineTool({
    name: writeName,
    description,
    input: Input,
    sequential: true,
    access: (params) => ({ kind: "write", paths: [params.path] }),
    run,
  });
});
