/**
 * Models.dev's `api.json`: providers by catalog id, each with its model entries. Each entry decodes
 * on its own, so one bad entry is skipped rather than failing the list.
 */
import { Option, Schema } from "effect";

import type { CatalogModel, ModelDetails, Wire } from "@shanepadgett/liminal-model/contract";

/** One provider: the AI SDK package its models use unless one names its own, and its entries. */
const ModelsDevProvider = Schema.Struct({
  npm: Schema.optionalKey(Schema.String),
  models: Schema.Record(Schema.String, Schema.Json),
});

type ModelsDevProvider = typeof ModelsDevProvider.Type;

/** Models.dev providers by catalog id, their model entries still undecoded. */
export const ModelsDevProviders = Schema.Record(Schema.String, ModelsDevProvider);

export type ModelsDevProviders = typeof ModelsDevProviders.Type;

/** The wire each AI SDK package speaks; models.dev names APIs by the package that calls them. */
const wires: Readonly<Record<string, Wire>> = {
  "@ai-sdk/anthropic": "messages",
  "@ai-sdk/openai": "responses",
  "@ai-sdk/openai-compatible": "chat",
};

const ReasoningOption = Schema.Struct({
  type: Schema.String,
  values: Schema.optionalKey(Schema.Array(Schema.String)),
});

const Entry = Schema.Struct({
  name: Schema.String,
  /** Missing or null is a chat model; an entry of another type does not decode. */
  type: Schema.optionalKey(
    Schema.NullOr(Schema.Literals(["chat", "embedding", "image", "realtime"])),
  ),
  reasoning: Schema.Boolean,
  reasoning_options: Schema.optionalKey(Schema.NullOr(Schema.Array(ReasoningOption))),
  tool_call: Schema.Boolean,
  structured_output: Schema.optionalKey(Schema.Boolean),
  modalities: Schema.optionalKey(Schema.Struct({ input: Schema.Array(Schema.String) })),
  limit: Schema.Struct({ context: Schema.Int, output: Schema.Int }),
  /** The package for this model when it differs from its provider's. */
  provider: Schema.optionalKey(Schema.Struct({ npm: Schema.optionalKey(Schema.String) })),
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

/**
 * The effort levels it lists, after `off` when thinking can be turned off: by a toggle, or by the
 * `none` effort, which is the same.
 */
const thinkingOf = (entry: Entry): ReadonlyArray<string> => {
  if (!entry.reasoning) return [];

  const options = entry.reasoning_options ?? [];
  const effort = options.find((option) => option.type === "effort")?.values ?? [];
  const levels = effort.filter((level) => level !== "none");

  const canTurnOff = effort.includes("none") || options.some((option) => option.type === "toggle");

  return canTurnOff ? ["off", ...levels] : levels;
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

/** The provider's models; entries that do not decode are skipped. */
export const catalogModels = (provider: ModelsDevProvider): ReadonlyArray<CatalogModel> =>
  Object.entries(provider.models).flatMap(([id, json]) => {
    const entry = decodeEntry(json);
    if (Option.isNone(entry)) return [];

    const npm = entry.value.provider?.npm ?? provider.npm;

    return [
      {
        id,
        name: entry.value.name,
        kind: entry.value.type ?? "chat",
        details: detailsOf(entry.value),
        wire: npm === undefined ? undefined : wires[npm],
      },
    ];
  });
