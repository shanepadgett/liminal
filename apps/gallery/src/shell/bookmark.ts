/**
 * Where the user was, saved to a file so the gallery reopens there after a restart. Names, not
 * indexes, so adding an entry does not move the user.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Option, Schema } from "effect";

const Bookmark = Schema.Struct({
  group: Schema.String,
  entry: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  palette: Schema.String,
  size: Schema.String,
});

export type Bookmark = typeof Bookmark.Type;

const BookmarkJson = Schema.fromJsonString(Bookmark);

const PATH = join(tmpdir(), "liminal-gallery-bookmark.json");

/** A missing or unreadable bookmark opens the gallery at its start. */
export const readBookmark = (): Bookmark | undefined => {
  let json: string;

  try {
    json = readFileSync(PATH, "utf8");
  } catch {
    return undefined;
  }

  return Option.getOrUndefined(Schema.decodeOption(BookmarkJson)(json));
};

export const writeBookmark = (bookmark: Bookmark): void => {
  writeFileSync(PATH, Schema.encodeSync(BookmarkJson)(bookmark));
};
