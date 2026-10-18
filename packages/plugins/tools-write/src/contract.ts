/** Write tool: the params of `write`; a relative path resolves in the workspace. */

import { Schema } from "effect";

export const WriteParams = Schema.Struct({
  path: Schema.String.annotate({ description: "File to write, relative to the workspace" }),
  content: Schema.String.annotate({ description: "The whole new content" }),
});
