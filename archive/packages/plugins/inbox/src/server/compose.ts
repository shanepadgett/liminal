/**
 * Turns what the user sends into a user message: its pictures saved where requests read them, and
 * what each `@` tag attaches, from the first tag source that knows the tag.
 */

import { Effect, FileSystem, Match, Option, Path } from "effect";

import type { ImageMediaType, ImagePart, ModelPart } from "@liminal/sdk";
import { userMessage } from "@liminal/session-log/contract";

import {
  AttachFailed,
  type TagAttachment,
  type TagSource,
  tagPaths,
  type UserInput,
} from "../contract.ts";

const extensions: Readonly<Record<ImageMediaType, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Saves a picture under its content's hash, so the same picture is kept once. */
const makeSavePicture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return Effect.fn("Inbox.savePicture")(
    function* (folder: string, data: Uint8Array, mediaType: ImageMediaType) {
      const name = new Bun.CryptoHasher("sha256").update(data).digest("hex");
      const file = path.join(folder, `${name}.${extensions[mediaType]}`);
      yield* fs.makeDirectory(folder, { recursive: true });
      if (!(yield* fs.exists(file))) yield* fs.writeFile(file, data);

      return { type: "image", path: file, mediaType } satisfies ImagePart;
    },
    Effect.mapError(
      (error) => new AttachFailed({ message: `Could not save a picture: ${error.message}` }),
    ),
  );
});

/** What the first source that knows `tag` attaches for it. */
const attachmentOf = Effect.fn("Inbox.attachmentOf")(function* (
  sources: ReadonlyArray<TagSource>,
  tag: string,
) {
  for (const source of sources) {
    const found = yield* source.attach(tag);
    if (Option.isSome(found)) return found;
  }

  return Option.none<TagAttachment>();
});

/**
 * Makes `compose(input)`: the user message for `input`, its text, then what its tags attach from
 * `sources` in order, then its pictures, saved in the `pictures` folder.
 */
export const makeCompose = Effect.fn("Inbox.makeCompose")(function* (
  sources: Effect.Effect<ReadonlyArray<TagSource>>,
  pictures: string,
) {
  const savePicture = yield* makeSavePicture;

  const partOf = (attachment: TagAttachment) =>
    Match.valueTags(attachment, {
      TagText: ({ text }): Effect.Effect<ModelPart, AttachFailed> =>
        Effect.succeed({ type: "text", text, providerData: {} }),
      TagImage: ({ data, mediaType }) => savePicture(pictures, data, mediaType),
    });

  return Effect.fn("Inbox.compose")(function* (input: UserInput) {
    const list = yield* sources;

    const attachments = yield* Effect.forEach(tagPaths(input.text), (tag) =>
      attachmentOf(list, tag),
    );

    const tagged = yield* Effect.forEach(attachments.flatMap(Option.toArray), partOf);

    const saved = yield* Effect.forEach(input.pictures, (picture) =>
      savePicture(pictures, picture.data, picture.mediaType),
    );

    return userMessage(input.text, [...tagged, ...saved]);
  });
});
