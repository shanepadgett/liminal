/** The `model` key in `settings.json`: the roles and how often a call is tried. */
import { Schema } from "effect";

import { Setting } from "@shanepadgett/liminal-settings/contract";

import { ModelChoice } from "./contract.ts";

export const ModelSetting = Setting.make(
  "model",
  Schema.Struct({
    main: Schema.optionalKey(ModelChoice),
    small: Schema.optionalKey(ModelChoice),
    /** Tries per model call, the first included. */
    attempts: Schema.optionalKey(Schema.Int),
  }),
);

export const defaultAttempts = 5;
