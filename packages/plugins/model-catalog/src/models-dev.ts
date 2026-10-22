/**
 * Models.dev's `api.json`: providers by catalog id, each with its model entries. Each entry decodes
 * on its own, so one bad entry is skipped rather than failing the list.
 */
import { Option, Schema } from "effect";

import type { ModelDetails } from "@shanepadgett/liminal-model/contract";

import type { CatalogModel } from "./contract.ts";

/** Models.dev entries by catalog id, then by model id, each still undecoded. */
export const ModelsDevProviders = Schema.Record(
  Schema.String,
  Schema.Struct({ models: Schema.Record(Schema.String, Schema.Json) }),
);

export type ModelsDevProviders = typeof ModelsDevProviders.Type;

const ReasoningOption = Schema.Struct({
  type: Schema.String,
  values: Schema.optionalKey(Schema.Array(Schema.String)),
});

const Entry = Schema.Struct({
  name: Schema.String,
  reasoning: Schema.Boolean,
  reasoning_options: Schema.optionalKey(Schema.NullOr(Schema.Array(ReasoningOption))),
  tool_call: Schema.Boolean,
  structured_output: Schema.optionalKey(Schema.Boolean),
  modalities: Schema.optionalKey(Schema.Struct({ input: Schema.Array(Schema.String) })),
  limit: Schema.Struct({ context: Schema.Int, output: Schema.Int }),
  cost: Schema.optionalKey(
    Schema.Struct({
      input: Schema.Finite,
      output: Schema.Finite,
      cache_read: Schema.optionalKey(Schema.Finite),
      cache_write: Schema.optionalKey(Schema.Finite),
    }),
  ),
});

type Entry = typeof Entry.Type;

const decodeEntry = Schema.decodeUnknownOption(Entry);

/** The effort levels it lists, after `off` when thinking can be turned off. */
const thinkingOf = (entry: Entry): ReadonlyArray<string> => {
  if (!entry.reasoning) return [];

  const options = entry.reasoning_options ?? [];
  const effort = options.find((option) => option.type === "effort")?.values ?? [];
  const toggles = options.some((option) => option.type === "toggle");

  return toggles ? ["off", ...effort] : effort;
};

const detailsOf = (entry: Entry): ModelDetails => ({
  contextWindow: entry.limit.context,
  outputLimit: entry.limit.output,
  thinking: thinkingOf(entry),
  images: entry.modalities?.input.includes("image") ?? false,
  toolCalls: entry.tool_call,
  structuredOutput: entry.structured_output ?? false,
  price:
    entry.cost === undefined
      ? undefined
      : {
          input: entry.cost.input,
          output: entry.cost.output,
          cacheRead: entry.cost.cache_read,
          cacheWrite: entry.cost.cache_write,
        },
});

/** The models among `entries`; entries that do not decode are skipped. */
export const catalogModels = (
  entries: Readonly<Record<string, Schema.Json>>,
): ReadonlyArray<CatalogModel> =>
  Object.entries(entries).flatMap(([id, json]) => {
    const entry = decodeEntry(json);

    return Option.isSome(entry)
      ? [{ id, name: entry.value.name, details: detailsOf(entry.value) }]
      : [];
  });
