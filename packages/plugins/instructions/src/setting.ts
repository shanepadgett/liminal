/** The `instructions` key in `settings.json`. */
import { Schema } from "effect";

import { Setting } from "@shanepadgett/liminal-settings/contract";

export const InstructionsSetting = Setting.make(
  "instructions",
  Schema.Struct({
    /** Whether `AGENTS.md` files go in the prompt; off unless set. */
    agentsFiles: Schema.optionalKey(Schema.Boolean),
  }),
);
