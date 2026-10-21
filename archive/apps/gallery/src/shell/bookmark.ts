/**
 * Where the user was, saved to a file so the gallery reopens there after a restart. Names instead
 * of indexes, so adding an entry does not move the user.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Option, Schema } from "effect";

export const Bookmark = Schema.Struct({
  groupTitle: Schema.String,
  entryId: Schema.optional(Schema.String),
  stateName: Schema.optional(Schema.String),
  paletteId: Schema.optional(Schema.String),
  sizeName: Schema.optional(Schema.String),
});

export type Bookmark = typeof Bookmark.Type;

const BookmarkJson = Schema.fromJsonString(Bookmark);

const BOOKMARK_PATH = join(tmpdir(), "liminal-gallery-bookmark.json");

/** A missing or unreadable bookmark opens the gallery at its start. */
export const readBookmark = (): Bookmark | undefined => {
  let json: string;

  try {
    json = readFileSync(BOOKMARK_PATH, "utf8");
  } catch {
    return undefined;
  }

  return Option.getOrUndefined(Schema.decodeOption(BookmarkJson)(json));
};

export const writeBookmark = (bookmark: Bookmark): void => {
  writeFileSync(BOOKMARK_PATH, Schema.encodeSync(BookmarkJson)(bookmark));
};
