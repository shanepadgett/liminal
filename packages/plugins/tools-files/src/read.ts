/** The `read` tool: a file as numbered lines, an image as itself, a folder as its entries. */
import { Effect, FileSystem, Option, Path, Schema } from "effect";
import { Base64 } from "effect/encoding";

import { Directories } from "@shanepadgett/liminal-directories/contract";
import { defineTool, ToolFailed, type ToolOutput } from "@shanepadgett/liminal-tools/contract";

import { entriesOf, isBinary, MAX_LINES, pageOf } from "./contract.ts";

/** An image larger than this as base64 fails the call. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const description = `Read a file or folder. Paths are relative to the workspace, or absolute.

A file comes back as numbered lines, such as \`12: text\`; the number and \`: \` are not part of the file. A page holds at most ${MAX_LINES} lines or 50 KB, and a footer says which offset reads on. Lines over 2,000 characters are cut. PNG, JPEG, GIF and WebP files come back as images. A folder lists its entries, each folder's ending in \`/\`.

Read several files, or several parts of one, with calls in the same reply.`;

const Input = Schema.Struct({
  path: Schema.String.annotate({ description: "The file or folder to read." }),
  offset: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
      description: "The line to start at, from 1. Default 1.",
    }),
  ),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
      description: `How many lines to read at most. Default and most ${MAX_LINES}.`,
    }),
  ),
});

type Input = typeof Input.Type;

const startsWith = (bytes: Uint8Array, prefix: ReadonlyArray<number>, at = 0) =>
  prefix.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

/** The image type `bytes` start like, by their first bytes. */
const imageType = (bytes: Uint8Array): Option.Option<string> => {
  if (startsWith(bytes, [0x89, ...ascii("PNG\r\n"), 0x1a, 0x0a])) return Option.some("image/png");
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return Option.some("image/jpeg");
  if (startsWith(bytes, ascii("GIF8"))) return Option.some("image/gif");

  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return Option.some("image/webp");
  }

  return Option.none();
};

const text = (value: string): ToolOutput => ({ content: [{ type: "text", text: value }] });

const failed = (message: string) => new ToolFailed({ message });

export const makeRead = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workspace } = yield* Directories;

  /** A page of `lines`, or a failure naming `name` when `offset` is past the end. */
  const page = (lines: string, name: string, input: Input) =>
    Option.match(pageOf(lines, input.offset, input.limit), {
      onNone: () => Effect.fail(failed(`Offset ${input.offset} is past the end of ${name}.`)),
      onSome: (shown) => Effect.succeed(text(shown)),
    });

  const readFolder = Effect.fn("read.folder")(function* (target: string, input: Input) {
    const entries = yield* entriesOf(fs, path, target);
    if (entries.length === 0) return text("[empty folder]");

    return yield* page(entries.join("\n"), input.path, input);
  });

  const readFile = Effect.fn("read.file")(function* (target: string, input: Input) {
    const bytes = yield* fs.readFile(target);
    const image = imageType(bytes);

    if (Option.isSome(image)) {
      const data = Base64.encode(bytes);
      if (data.length > MAX_IMAGE_BYTES) return yield* failed(`${input.path} is over 5 MB.`);

      const output: ToolOutput = { content: [{ type: "image", mediaType: image.value, data }] };

      return output;
    }

    if (isBinary(bytes)) return yield* failed(`${input.path} is a binary file; read shows text.`);

    return yield* page(new TextDecoder().decode(bytes), input.path, input);
  });

  const run = (input: Input) =>
    Effect.gen(function* () {
      const target = path.resolve(workspace, input.path);
      const info = yield* Effect.option(fs.stat(target));
      if (Option.isNone(info)) return yield* failed(`Nothing is at ${input.path}.`);
      if (info.value.type === "Directory") return yield* readFolder(target, input);

      return yield* readFile(target, input);
    }).pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(failed(error.message))));

  return defineTool({ name: "read", description, input: Input, run });
});
