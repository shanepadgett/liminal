/** The `edit` tool: exact text replacements in one file, saved with a patch of the change. */
import { createPatch } from "diff";
import { Effect, FileSystem, Option, Path, Schema } from "effect";

import { Directories } from "@shanepadgett/liminal-directories/contract";
import { SessionLog } from "@shanepadgett/liminal-session/contract";
import { isBinary } from "@shanepadgett/liminal-tools-read/contract";
import { defineTool, ToolFailed, type ToolContext } from "@shanepadgett/liminal-tools/contract";

import { Changed, editName } from "./contract.ts";
import { applyEdits, toLf } from "./match.ts";

const BOM = "\uFEFF";

const description = `Change a file by replacing exact text. Paths are relative to the workspace, or absolute.

Each edit's oldText must appear once in the file as it was before this call; give enough lines around it to make it unique. Edits in one call must not overlap. Copy oldText from what read showed, without the line numbers. To change several places in one file, give several edits in one call. To make a new file, use write.`;

const Input = Schema.Struct({
  path: Schema.String.annotate({ description: "The file to change." }),
  edits: Schema.NonEmptyArray(
    Schema.Struct({
      oldText: Schema.String.annotate({ description: "The text to replace, found once." }),
      newText: Schema.String.annotate({ description: "The text to put in its place." }),
    }),
  ).annotate({ description: "The replacements, each found in the file as it was." }),
});

type Input = typeof Input.Type;

/** A file's text without its BOM and with LF line endings, and what to restore on writing. */
const textOf = (bytes: Uint8Array) => {
  const raw = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  const bom = raw.startsWith(BOM) ? BOM : "";
  const body = raw.slice(bom.length);

  return { bom, isCrlf: body.includes("\r\n"), text: toLf(body) };
};

const failed = (message: string) => new ToolFailed({ message });

export const makeEdit = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const log = yield* SessionLog;
  const { workspace } = yield* Directories;

  /** The file's bytes; a folder, a missing file and a binary one fail. */
  const bytesAt = Effect.fn("edit.bytes")(function* (target: string, shown: string) {
    const info = yield* Effect.option(fs.stat(target));
    if (Option.isNone(info)) return yield* failed(`Nothing is at ${shown}; use write to make it.`);
    if (info.value.type === "Directory") return yield* failed(`${shown} is a folder.`);

    const bytes = yield* fs.readFile(target);
    if (isBinary(bytes)) return yield* failed(`${shown} is a binary file; edit changes text.`);

    return bytes;
  });

  const run = (input: Input, { session, callId }: ToolContext) =>
    Effect.gen(function* () {
      const target = path.resolve(workspace, input.path);
      const { bom, isCrlf, text } = textOf(yield* bytesAt(target, input.path));

      const edits = input.edits.map(({ oldText, newText }) => ({
        oldText: toLf(oldText),
        newText: toLf(newText),
      }));

      const changed = yield* applyEdits(text, edits);
      const written = isCrlf ? changed.replaceAll("\n", "\r\n") : changed;

      yield* fs.writeFileString(target, bom + written);

      const patch = createPatch(input.path, text, changed);
      yield* log.append(session, [yield* Changed.make({ callId, path: input.path, patch })]);

      const count = edits.length === 1 ? "1 change" : `${edits.length} changes`;

      return { content: [{ type: "text" as const, text: `Edited ${input.path}: ${count}` }] };
    }).pipe(Effect.mapError(({ message }) => failed(message)));

  return defineTool({
    name: editName,
    description,
    input: Input,
    sequential: true,
    access: (params) => ({ kind: "write", paths: [params.path] }),
    run,
  });
});
