/** Reads built-in entry definitions from contracts without loading plugin servers or TUI parts. */

import { fileURLToPath } from "node:url";

import { Effect, FileSystem, Path, Predicate, Schema } from "effect";

import type { EntryDefinition } from "@liminal/sdk";

export class DefinitionsUnreadable extends Schema.TaggedError<
  DefinitionsUnreadable,
  { readonly brand: unique symbol }
>()("DefinitionsUnreadable", { message: Schema.String }) {}

const isEntryDefinition = (value: unknown): value is EntryDefinition => {
  if (!Predicate.isObject(value)) return false;

  return (
    Predicate.isString(value["kind"])
    && Schema.isSchema(value["data"])
    && Predicate.isBoolean(value["model"])
    && ["shown", "hidden", "debug", "per-entry"].includes(String(value["user"]))
  );
};

/** The repository's built-in contracts only; installed third-party plugins are not executed. */
export const loadEntryDefinitions = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = fileURLToPath(new URL("../../../../packages/plugins/", import.meta.url));
  const definitions = new Map<string, EntryDefinition>();

  for (const name of (yield* fs.readDirectory(folder)).toSorted()) {
    const contract = path.join(folder, name, "src", "contract.ts");
    if (!(yield* fs.exists(contract))) continue;

    const exports: unknown = yield* Effect.tryPromise({
      try: () => import(contract),
      catch: () =>
        new DefinitionsUnreadable({
          message: `Cannot load the built-in contract for ${name}; fix its imports and retry the audit.`,
        }),
    });

    if (!Predicate.isObject(exports))
      return yield* new DefinitionsUnreadable({
        message: `The built-in contract for ${name} has no module exports; fix it before auditing.`,
      });

    for (const definition of Object.values(exports).filter(isEntryDefinition)) {
      const existing = definitions.get(definition.kind);

      if (existing !== undefined && existing !== definition)
        return yield* new DefinitionsUnreadable({
          message: `Entry kind ${definition.kind} has conflicting definitions; resolve them before auditing.`,
        });

      definitions.set(definition.kind, definition);
    }
  }

  if (definitions.size === 0)
    return yield* new DefinitionsUnreadable({
      message: "No built-in entry definitions were found; run the audit from a Liminal checkout.",
    });

  return definitions;
});
