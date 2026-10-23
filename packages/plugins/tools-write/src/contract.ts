/** What `write` saves beside its result, for frontends to show. */
import { Schema } from "effect";

import { defineEvent } from "@shanepadgett/liminal-session/contract";

/** The tool's name. */
export const writeName = "write";

/** A file a `write` call made or replaced: the change as a unified patch. The model never sees it. */
export const Written = defineEvent(
  "tools-write/written",
  Schema.Struct({ callId: Schema.String, path: Schema.String, patch: Schema.String }),
);
