/**
 * Which model each session runs: the pick an input carries, the pick event the log keeps, the
 * default a new session starts on, and what screens call.
 */
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { Attribute } from "@shanepadgett/liminal-core";
import { ModelChoice, ModelNotFound } from "@shanepadgett/liminal-model/contract";
import {
  defineEvent,
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";
import {
  Setting,
  SettingsInvalid,
  SettingsWriteFailed,
} from "@shanepadgett/liminal-settings/contract";

/** On an input: the model the user picked to run it. Logged as a `Picked` event, then dropped. */
export const ModelPick = Attribute.make("model-choice/pick", ModelChoice);

/** The session runs this model from here on. */
export const Picked = defineEvent("model-choice/pick", ModelChoice);

/** The `model-choice` key in `settings.json`: the model a new session starts on. */
export const ModelChoiceSetting = Setting.make(
  "model-choice",
  Schema.Struct({ default: Schema.optionalKey(ModelChoice) }),
);

export const sameChoice = (a: ModelChoice, b: ModelChoice) =>
  a.model === b.model && a.thinking === b.thinking;

/** The models picker's name, for a `Pickers` wrap. */
export const MODELS_PICKER = "model-choice/models";

/** What screens call. */
export class ModelChoiceRpc extends RpcGroup.make(
  /** The model `session` runs next; without one, the model a new session starts on. */
  Rpc.make("model-choice/session", {
    payload: { session: Schema.optional(SessionId) },
    success: ModelChoice,
    error: Schema.Union([ModelNotFound, SettingsInvalid, SessionNotFound, SessionStoreFailed]),
  }),
  /** The saved default, or none when the user has not saved one. */
  Rpc.make("model-choice/default", {
    success: Schema.UndefinedOr(ModelChoice),
    error: SettingsInvalid,
  }),
  /** Saves the default in the global settings file. */
  Rpc.make("model-choice/set-default", {
    payload: { choice: ModelChoice },
    error: SettingsWriteFailed,
  }),
) {}
