/**
 * Models.dev's `api.json`: providers by catalog id, each with its model entries. Each entry decodes
 * on its own, so one bad entry is skipped rather than failing the list.
 */

import { Option, Schema } from "effect";

import {
  defaultThinkingOf,
  type ModelInfo,
  ThinkingBudget,
  ThinkingEffort,
  type ThinkingOption,
  ThinkingOff,
  ThinkingOn,
} from "@liminal/sdk";

import type { CatalogModel } from "../contract.ts";

/** Models.dev entries by catalog id, then by model id, each still undecoded. */
export const ModelsDevProviders = Schema.Record(
  Schema.String,
  Schema.Struct({ models: Schema.Record(Schema.String, Schema.Json) }),
);

export type ModelsDevProviders = typeof ModelsDevProviders.Type;

const ReasoningOption = Schema.Struct({
  type: Schema.String,
  values: Schema.optionalKey(Schema.Array(Schema.String)),
  min: Schema.optionalKey(Schema.Int),
  max: Schema.optionalKey(Schema.Int),
});

type ReasoningOption = typeof ReasoningOption.Type;

const Entry = Schema.Struct({
  name: Schema.String,
  reasoning: Schema.Boolean,
  tool_call: Schema.Boolean,
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
  reasoning_options: Schema.optionalKey(Schema.NullOr(Schema.Array(ReasoningOption))),
  /** Set when the model uses another protocol than its provider's, named by its AI SDK package. */
  provider: Schema.optionalKey(Schema.Struct({ npm: Schema.optionalKey(Schema.String) })),
});

type Entry = typeof Entry.Type;

const decodeEntry = Schema.decodeUnknownOption(Entry);

/** The smallest budget Anthropic takes, used when models.dev gives no minimum. */
const minimumBudget = 1024;

const effortOptions = (values: ReadonlyArray<string>) =>
  values.map((effort): ThinkingOption => ({
    id: effort,
    label: effort,
    value: ThinkingEffort.make({ effort }),
  }));

const budget = (id: string, tokens: number): ThinkingOption => ({
  id,
  label: `${id} · ${tokens.toLocaleString("en-US")} tokens`,
  value: ThinkingBudget.make({ tokens }),
});

/** Low: the minimum; medium: a quarter of the most; high: half; max: the output limit less one. */
const budgetOptions = (option: ReasoningOption, outputLimit: number) => {
  const low = option.min ?? minimumBudget;
  const most = Math.min(option.max ?? outputLimit - 1, outputLimit - 1);
  if (most < low) return [];

  return [
    budget("low", low),
    budget("medium", Math.max(low, Math.floor(most / 4))),
    budget("high", Math.max(low, Math.floor(most / 2))),
    budget("max", most),
  ];
};

const off: ThinkingOption = { id: "off", label: "off", value: ThinkingOff.make({}) };
const on: ThinkingOption = { id: "on", label: "on", value: ThinkingOn.make({}) };

/**
 * The entry's thinking options. Effort values win over a budget when a model lists both, as
 * OpenCode does; a toggle adds `off` unless an effort already turns thinking off with `none`.
 */
const thinkingOf = (entry: Entry): ReadonlyArray<ThinkingOption> => {
  if (!entry.reasoning) return [];

  const options = entry.reasoning_options ?? [];
  const effort = options.find((option) => option.type === "effort")?.values ?? [];
  const budgetTokens = options.find((option) => option.type === "budget_tokens");
  const toggles = options.some((option) => option.type === "toggle");

  const main =
    effort.length > 0 || budgetTokens === undefined
      ? effortOptions(effort)
      : budgetOptions(budgetTokens, entry.limit.output);

  if (!toggles || effort.includes("none")) return main;

  return main.length === 0 ? [off, on] : [off, ...main];
};

const isInput = (input: string) => input === "text" || input === "image";

const priceOf = (cost: NonNullable<Entry["cost"]>) => ({
  input: cost.input,
  output: cost.output,
  cacheRead: cost.cache_read ?? 0,
  cacheWrite: cost.cache_write ?? 0,
});

const infoOf = (id: string, entry: Entry): ModelInfo => {
  const thinking = thinkingOf(entry);

  return {
    id,
    name: entry.name,
    contextWindow: entry.limit.context,
    maxOutput: entry.limit.output,
    thinking,
    defaultThinking: defaultThinkingOf(thinking),
    input: (entry.modalities?.input ?? ["text"]).filter(isInput),
    price: entry.cost === undefined ? undefined : priceOf(entry.cost),
  };
};

const catalogModelOf = (id: string, entry: Entry): CatalogModel => ({
  info: infoOf(id, entry),
  package: Option.fromUndefinedOr(entry.provider?.npm),
});

/** The tool-calling models among `entries`; entries that do not decode are skipped. */
export const catalogModels = (entries: Readonly<Record<string, Schema.Json>>) =>
  Object.entries(entries).flatMap(([id, json]) => {
    const entry = decodeEntry(json);

    return Option.isSome(entry) && entry.value.tool_call ? [catalogModelOf(id, entry.value)] : [];
  });
