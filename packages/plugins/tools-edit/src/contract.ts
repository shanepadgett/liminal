/** Edit tool: the params of `edit`; a relative path resolves in the workspace. */

import { Schema } from "effect";

export const EditParams = Schema.Struct({
  path: Schema.String.annotate({ description: "File to edit, relative to the workspace" }),
  oldText: Schema.String.annotate({ description: "Text that appears exactly once in the file" }),
  newText: Schema.String.annotate({ description: "Text that replaces it" }),
});
