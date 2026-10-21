/**
 * Pictures into the composer: ctrl+v and an empty paste read the clipboard's picture, and a pasted
 * picture path, as a terminal pastes a dropped file, reads that file. Each becomes an `[Image N]`
 * chip at the cursor.
 */

import type { PasteEvent, TextareaRenderable } from "@opentui/core";
import { type Effect, Option } from "effect";

import type { Picture } from "../contract.ts";
import {
  createPictures,
  droppedPicture,
  readClipboardPicture,
  readPictureFile,
} from "./pictures.ts";

/** Runs `read`, calling `added` with the picture it finds. */
export type ReadPicture = (
  read: Effect.Effect<Option.Option<Picture>>,
  added: (picture: Picture) => void,
) => void;

const decoder = new TextDecoder();

export const usePictures = (read: ReadPicture, input: () => TextareaRenderable | undefined) => {
  const pictures = createPictures();

  const added = (picture: Picture) => {
    input()?.insertText(`${pictures.add(picture)} `);
  };

  const fromClipboard = () => {
    read(readClipboardPicture, added);
  };

  const onPaste = (event: PasteEvent) => {
    const text = decoder.decode(event.bytes);

    if (text.trim() === "") {
      event.preventDefault();
      fromClipboard();

      return;
    }

    Option.match(droppedPicture(text), {
      onNone: () => {},
      onSome: ({ path, mediaType }) => {
        event.preventDefault();
        read(readPictureFile(path, mediaType), added);
      },
    });
  };

  return { take: pictures.take, onPaste, fromClipboard };
};
