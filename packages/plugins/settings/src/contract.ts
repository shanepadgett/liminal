/** Settings: layered `settings.json` files, one section per plugin. */

import { Context, type Effect, Schema } from "effect";

/** The files a write can change: `<global>/settings.json` or `<project>/settings.json`. */
export type SettingsLayer = "global" | "project";

/** A settings file that does not parse, or a section its Schema rejects. */
export class SettingsInvalid extends Schema.TaggedError<
  SettingsInvalid,
  { readonly brand: unique symbol }
>()("SettingsInvalid", { section: Schema.String, message: Schema.String }) {}

export class SettingsWriteFailed extends Schema.TaggedError<
  SettingsWriteFailed,
  { readonly brand: unique symbol }
>()("SettingsWriteFailed", { file: Schema.String, message: Schema.String }) {}

/** A section Schema: decodes the section's JSON with no services. */
export type SectionSchema = Schema.Top & { readonly DecodingServices: never };

export class Settings extends Context.Service<
  Settings,
  {
    /**
     * Section `name` from every loaded layer, merged and decoded by `schema`; read on each call. A
     * missing section is `{}`, so the Schema's defaults are the built-in layer.
     */
    readonly section: <S extends SectionSchema>(
      name: string,
      schema: S,
    ) => Effect.Effect<S["Type"], SettingsInvalid>;
    /** Sets the value at `path` in one file, keeping its comments; `undefined` removes it. */
    readonly write: (
      layer: SettingsLayer,
      path: ReadonlyArray<string>,
      value?: Schema.Json,
    ) => Effect.Effect<void, SettingsWriteFailed>;
  }
>()("liminal/settings/Settings") {}
