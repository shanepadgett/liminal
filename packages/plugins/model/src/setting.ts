/** The `model` key in `settings.json`: the roles, the classifier and how often a call is tried. */
import { Schema } from "effect";

import { Setting } from "@shanepadgett/liminal-settings/contract";

import { ModelChoice, ModelId } from "./contract.ts";

export const ModelSetting = Setting.make(
  "model",
  Schema.Struct({
    main: Schema.optionalKey(ModelChoice),
    small: Schema.optionalKey(ModelChoice),
    /** The model `Models.classify` calls when none is named. */
    classifier: Schema.optionalKey(ModelId),
    /** Tries per model call, the first included. */
    attempts: Schema.optionalKey(Schema.Int),
  }),
);

export const defaultAttempts = 5;
