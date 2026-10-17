/** Checks the runtime shape of what manifests and server modules export. */

import { Context, Layer, Predicate, Schema } from "effect";

import type { ServiceTag } from "@liminal/sdk";

/** A manifest's `server`; the module its Promise holds is checked by `ServerModule`. */
type LoadServer = () => Promise<object>;

const isLoadServer = (input: unknown): input is LoadServer => Predicate.isFunction(input);

const isServiceTag = (input: unknown): input is ServiceTag => Context.isKey(input);

const Tags = Schema.Array(Schema.declare(isServiceTag, { title: "service tag" }));

/** A plugin manifest as the host reads it. */
export const Manifest = Schema.Struct({
  name: Schema.String,
  provides: Tags,
  requires: Tags,
  uses: Tags,
  enabledByDefault: Schema.Boolean,
  server: Schema.declare(isLoadServer, { title: "server loader" }),
});

export type Manifest = typeof Manifest.Type;

/**
 * A server's Layer as the host builds it. The host provides what it needs as context, and reports a
 * failure only as the whole Cause, so neither type is read.
 */
export type ServerLayer = Layer.Layer<never>;

const isServerLayer = (input: unknown): input is ServerLayer => Layer.isLayer(input);

/** The module a manifest's `server` loads. */
export const ServerModule = Schema.Struct({
  layer: Schema.declare(isServerLayer, { title: "Layer" }),
});

/** A manifest module's default export. */
export const ManifestModule = Schema.Struct({ default: Manifest });
