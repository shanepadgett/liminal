/** What `edit` saves beside its result, for frontends to show. */
import { Schema } from "effect";

import { defineEvent } from "@shanepadgett/liminal-session/contract";

/** The tool's name. */
export const editName = "edit";

/** A file an `edit` call changed: the change as a unified patch. The model never sees it. */
export const Changed = defineEvent(
  "tools-edit/changed",
  Schema.Struct({ callId: Schema.String, path: Schema.String, patch: Schema.String }),
);
