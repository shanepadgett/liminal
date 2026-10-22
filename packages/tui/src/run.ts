/** Opens the TUI: each plugin's `tui` entry, composed over the base, until the user quits. */
import { createCliRenderer } from "@opentui/core";
import { Effect, Layer, Predicate, Schema } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { type AnyPlugin, compose } from "@shanepadgett/liminal-core";

import { base } from "./base.ts";
import { root } from "./root.tsx";

/** A plugin's `tui` entry does not default-export a plugin. */
export class EntryInvalid extends Schema.TaggedError<
  EntryInvalid,
  { readonly brand: unique symbol }
>()("EntryInvalid", { plugin: Schema.String }) {
  override get message() {
    return `${this.plugin}'s tui entry must default-export a plugin.`;
  }
}

const isPlugin = (value: unknown): value is AnyPlugin =>
  Predicate.hasProperty(value, "name")
  && Predicate.isString(value.name)
  && Predicate.hasProperty(value, "provides")
  && Array.isArray(value.provides)
  && Predicate.hasProperty(value, "requires")
  && Array.isArray(value.requires)
  && Predicate.hasProperty(value, "layer")
  && Layer.isLayer(value.layer);

const loadEntry = Effect.fn("loadEntry")(function* (plugin: AnyPlugin) {
  const load = plugin.entries?.["tui"];
  if (load === undefined) return [];
  const entry = yield* Effect.promise(load);
  const exported = Predicate.hasProperty(entry, "default") ? entry.default : undefined;
  if (!isPlugin(exported)) return yield* new EntryInvalid({ plugin: plugin.name });

  return [exported];
});

const acquireRenderer = Effect.acquireRelease(
  Effect.promise(() => createCliRenderer({ exitOnCtrlC: false })),
  (renderer) =>
    Effect.sync(() => {
      renderer.destroy();
    }),
);

/** Runs the TUI until the user quits; the terminal is restored before it returns or fails. */
export const run = Effect.fn("tui.run")(function* (plugins: ReadonlyArray<AnyPlugin>) {
  const host = yield* Host;
  const entries = yield* Effect.forEach(plugins, loadEntry);

  yield* Effect.scoped(
    Effect.gen(function* () {
      const renderer = yield* acquireRenderer;
      yield* Layer.build(compose([base(host, renderer), ...entries.flat(), root]));
      yield* Effect.promise(() => renderer.closed);
    }),
  );
});
