/**
 * The model picker's options, every active provider's models with one section per provider, and the
 * thinking picker's options for the model picked.
 */

import { Effect } from "effect";

import {
  type ModelInfo,
  type ModelRef,
  type ProviderInfo,
  type ThinkingOption,
  thinkingOptionOf,
} from "@liminal/sdk";
import type { SelectOption } from "@liminal/sdk/tui";

/** A provider and the models it lists. */
export interface ProviderModels {
  readonly provider: ProviderInfo;
  readonly models: ReadonlyArray<ModelInfo>;
}

/** A listed model and the reference that names it. */
export interface PickedModel {
  readonly ref: ModelRef;
  readonly info: ModelInfo;
}

/**
 * Every provider with the models it lists. A provider that cannot list its models, such as one not
 * logged in, is left out.
 */
export const listAll = <E, R, F, S>(
  providers: Effect.Effect<ReadonlyArray<ProviderInfo>, F, S>,
  list: (provider: ProviderInfo) => Effect.Effect<ReadonlyArray<ModelInfo>, E, R>,
) => {
  const listOne = (provider: ProviderInfo) =>
    list(provider).pipe(
      Effect.map((models): ReadonlyArray<ProviderModels> => [{ provider, models }]),
      Effect.catch((error) =>
        Effect.logWarning(`${provider.name} lists no models`, error).pipe(Effect.as([])),
      ),
    );

  return providers.pipe(
    Effect.flatMap((each) => Effect.forEach(each, listOne)),
    Effect.map((each) => each.flat()),
  );
};

/** One option's value: the model as `provider/id`, so options compare by text. */
export const modelKey = (model: ModelRef) => `${model.provider}/${model.id}`;

/** Each model as an option under its provider's name, its key the value. */
export const modelOptions = (listed: ReadonlyArray<ProviderModels>) =>
  listed.flatMap(({ provider, models }) =>
    models.map((model): SelectOption<string> => ({
      title: model.name,
      value: modelKey({ provider: provider.id, id: model.id }),
      description: model.id,
      category: provider.name,
    })),
  );

/** The model an option's key names. */
export const modelOf = (listed: ReadonlyArray<ProviderModels>, key: string) =>
  listed
    .flatMap(({ provider, models }) =>
      models.map((info): PickedModel => ({ ref: { provider: provider.id, id: info.id }, info })),
    )
    .find((model) => modelKey(model.ref) === key);

/** Each thinking option, its id the value. */
export const thinkingOptions = (info: ModelInfo) =>
  info.thinking.map((option: ThinkingOption): SelectOption<string> => ({
    title: option.label,
    value: option.id,
  }));

/** The option highlighted first: the saved one when the model offers it, else its default. */
export const currentThinking = (info: ModelInfo, saved: string | undefined) =>
  thinkingOptionOf(info, saved)?.id;
