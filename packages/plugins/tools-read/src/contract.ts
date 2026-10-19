/**
 * Read tool: the params of `read`, a relative path resolving in the workspace, and the line window
 * its output shows, so other plugins can show files the same way.
 */

import { Schema } from "effect";

export const ReadParams = Schema.Struct({
  path: Schema.String.annotate({ description: "File to read, relative to the workspace" }),
  offset: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
      description: "First line to read, from 1",
    }),
  ),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
      description: "Most lines to read",
    }),
  ),
});

/** The lines `offset` (from 1) through `offset + limit - 1`, and a note when more follow. */
export const lineWindow = (content: string, offset: number, limit: number): string => {
  const lines = content.split("\n");
  const shown = lines.slice(offset - 1, offset - 1 + limit);
  const last = offset - 1 + shown.length;
  if (last >= lines.length) return shown.join("\n");

  return `${shown.join("\n")}\n[lines ${offset}-${last} of ${lines.length}; read on from offset ${last + 1}]`;
};
