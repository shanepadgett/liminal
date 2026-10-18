/** The model picker's options: every active provider's models, one section per provider. */

import type { ModelInfo, ModelRef, ProviderInfo } from "@liminal/sdk";
import type { SelectOption } from "@liminal/sdk/tui";

/** A provider and the models it lists. */
export interface ProviderModels {
  readonly provider: ProviderInfo;
  readonly models: ReadonlyArray<ModelInfo>;
}

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
      models.map((model) => ({ provider: provider.id, id: model.id })),
    )
    .find((model) => modelKey(model) === key);
