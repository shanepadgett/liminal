/**
 * The pictures the user adds to the input. Each shows in the text as an `[Image N]` chip; the bytes
 * wait here until the text is sent, and a chip the user deleted drops its picture.
 */

import { fileURLToPath } from "node:url";

import { Effect, Option } from "effect";

import type { ImageMediaType } from "@liminal/sdk";

import type { Picture, UserInput } from "../contract.ts";

const CHIP = /\[Image (\d+)\]/g;

const pictureTypes: Readonly<Record<string, ImageMediaType>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** The picture type of a file by its extension; none for any other file. */
const pictureTypeOf = (path: string) =>
  Option.fromUndefinedOr(pictureTypes[path.split(".").at(-1)?.toLowerCase() ?? ""]);

/** The input's pictures, numbered from 1 as they are added. */
export const createPictures = () => {
  const added = new Map<number, Picture>();
  let last = 0;

  return {
    /** Keeps the picture and gives the chip to put in the text. */
    add: (picture: Picture) => {
      last += 1;
      added.set(last, picture);

      return `[Image ${last}]`;
    },
    /**
     * The input for `text`: its chips renumbered 1, 2, … in order, with the pictures they name.
     * Chips naming no picture stay as plain text. Sending ends the input's pictures.
     */
    take: (text: string): UserInput => {
      const pictures: Picture[] = [];

      const numbered = text.replace(CHIP, (chip, digits: string) => {
        const picture = added.get(Number(digits));
        if (picture === undefined) return chip;
        pictures.push(picture);

        return `[Image ${pictures.length}]`;
      });

      added.clear();
      last = 0;

      return { text: numbered, pictures };
    },
  };
};

/** The path a terminal pastes for a dropped file: maybe quoted, escaped, or a `file://` link. */
const pastedPath = (text: string) => {
  const quoted = /^(["'])(.*)\1$/.exec(text);
  const unquoted = quoted?.[2] ?? text.replaceAll(/\\(.)/g, "$1");

  return unquoted.startsWith("file://") ? fileURLToPath(unquoted) : unquoted;
};

/** The picture file a paste names when the user drops one on the terminal; none for other text. */
export const droppedPicture = (pasted: string) => {
  const text = pasted.trim();
  if (text === "" || text.includes("\n")) return Option.none();
  const path = pastedPath(text);

  return Option.map(pictureTypeOf(path), (mediaType) => ({ path, mediaType }));
};

/** Reads a picture file; none when it cannot be read. */
export const readPictureFile = (path: string, mediaType: ImageMediaType) =>
  Effect.tryPromise(() => Bun.file(path).bytes()).pipe(
    Effect.map((data): Picture => ({ data, mediaType })),
    Effect.option,
  );

/** Linux has no clipboard reader in Bun; the first of these that finds a picture gives it. */
const LINUX_READERS = [
  ["wl-paste", "--type", "image/png"],
  ["xclip", "-selection", "clipboard", "-t", "image/png", "-o"],
] as const;

const fromCommand = (command: ReadonlyArray<string>) =>
  Effect.tryPromise(async () => {
    const child = Bun.spawn([...command], { stdout: "pipe", stderr: "ignore" });
    const data = await new Response(child.stdout).bytes();

    return (await child.exited) === 0 && data.length > 0 ? Option.some(data) : Option.none();
  }).pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));

const fromLinux = Effect.gen(function* () {
  for (const command of LINUX_READERS) {
    const found = yield* fromCommand(command);
    if (Option.isSome(found)) return found;
  }

  return Option.none<Uint8Array>();
});

const fromBun = Effect.tryPromise(async () => {
  const image = Bun.Image.fromClipboard();

  return image === null ? Option.none() : Option.some(await image.png().bytes());
}).pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));

/** The clipboard's picture as a PNG; none when it holds none or cannot be read. */
export const readClipboardPicture = (process.platform === "linux" ? fromLinux : fromBun).pipe(
  Effect.map(Option.map((data): Picture => ({ data, mediaType: "image/png" }))),
);
