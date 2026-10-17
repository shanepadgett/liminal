/** File tools: the params of `read`, `write` and `edit`; relative paths resolve in the workspace. */

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

export const WriteParams = Schema.Struct({
  path: Schema.String.annotate({ description: "File to write, relative to the workspace" }),
  content: Schema.String.annotate({ description: "The whole new content" }),
});

export const EditParams = Schema.Struct({
  path: Schema.String.annotate({ description: "File to edit, relative to the workspace" }),
  oldText: Schema.String.annotate({ description: "Text that appears exactly once in the file" }),
  newText: Schema.String.annotate({ description: "Text that replaces it" }),
});
