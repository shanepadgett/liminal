/** Settings: each plugin's key in the global and project `settings.json`. */
import { Context, type Effect, Schema } from "effect";

import { Registry } from "@shanepadgett/liminal-core";

/**
 * One plugin's key in `settings.json`. Its value is an object whose schema holds the defaults; a
 * missing key reads as `{}`.
 */
export interface Setting<T> {
  /** Unique across plugins; the plugin's name. */
  readonly key: string;
  readonly schema: Schema.Codec<T, Schema.JsonObject>;
}

const make = <T>(key: string, schema: Schema.Codec<T, Schema.JsonObject>): Setting<T> => ({
  key,
  schema,
});

export const Setting = { make };

/** The settings file a write changes. */
export type SettingsScope = "global" | "project";

/** A settings file that does not parse, or a value its setting's schema rejects. */
export class SettingsInvalid extends Schema.TaggedError<
  SettingsInvalid,
  { readonly brand: unique symbol }
>()("SettingsInvalid", { key: Schema.String, message: Schema.String }) {}

export class SettingsWriteFailed extends Schema.TaggedError<
  SettingsWriteFailed,
  { readonly brand: unique symbol }
>()("SettingsWriteFailed", { file: Schema.String, message: Schema.String }) {}

export class Settings extends Context.Service<
  Settings,
  {
    /** The setting's value, the project file's over the global file's; read on each call. */
    readonly get: <T>(setting: Setting<T>) => Effect.Effect<T, SettingsInvalid>;
    /** Sets the value at `path` in one file, keeping its comments; `undefined` removes it. */
    readonly write: (
      scope: SettingsScope,
      path: ReadonlyArray<string>,
      value: Schema.Json | undefined,
    ) => Effect.Effect<void, SettingsWriteFailed>;
  }
>()("settings/Settings") {}

/** Every plugin's setting, for the settings screen to list. */
export class DeclaredSettings extends Registry.Service<DeclaredSettings, Setting<unknown>>()(
  "settings/DeclaredSettings",
) {}
