/** Read tool: the params of `read`; a relative path resolves in the workspace. */

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
