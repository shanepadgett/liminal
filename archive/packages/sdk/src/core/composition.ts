/** Which plugins run, as the user set it in `plugins.json`, and whether the workspace is trusted. */

import { Context, type Effect, Schema } from "effect";

/** A `plugins.json` that does not parse or has the wrong shape. */
export class CompositionInvalid extends Schema.TaggedError<
  CompositionInvalid,
  { readonly brand: unique symbol }
>()("CompositionInvalid", { file: Schema.String, message: Schema.String }) {}

/** A `plugins.json` that could not be written. */
export class CompositionWriteFailed extends Schema.TaggedError<
  CompositionWriteFailed,
  { readonly brand: unique symbol }
>()("CompositionWriteFailed", { file: Schema.String, message: Schema.String }) {}

/**
 * Whether the user trusts the workspace, so its project settings and plugins load. The global
 * `plugins.json` holds the trusted folders.
 */
export class ProjectTrust extends Context.Service<
  ProjectTrust,
  {
    /** Read on each call. */
    readonly trusted: Effect.Effect<boolean, CompositionInvalid>;
    /** Trusts the workspace from now on; its plugins load with the next graph change. */
    readonly trust: Effect.Effect<void, CompositionInvalid | CompositionWriteFailed>;
  }
>()("liminal/sdk/ProjectTrust") {}
