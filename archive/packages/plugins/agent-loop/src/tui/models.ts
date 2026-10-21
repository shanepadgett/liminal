/**
 * The model picker's options, every signed-in provider's models with one section per provider, and
 * the thinking picker's options for the model picked.
 */

import { Effect, Option, Schema } from "effect";

import {
  ModelError,
  type ModelInfo,
  type ModelRef,
  type ProviderInfo,
  type ThinkingOption,
  thinkingOptionOf,
} from "@liminal/sdk";
import type { SelectOption } from "@liminal/sdk/tui";

/** A provider and the models it lists, or the failure that kept it from listing any. */
export interface ProviderModels {
  readonly provider: ProviderInfo;
  readonly models: ReadonlyArray<ModelInfo>;
  readonly failure?: string;
}

const isModelError = Schema.is(ModelError);

/** Whether a provider failed to list because it is not signed in. */
const isSignedOut = (error: { readonly message: string }) =>
  isModelError(error) && error.reason === "auth";

/** A listed model and the reference that names it. */
export interface PickedModel {
  readonly ref: ModelRef;
  readonly info: ModelInfo;
}

/**
 * Every signed-in provider with the models it lists. A provider not signed in is left out; one
 * whose list failed comes with the failure, after the providers that listed.
 */
export const listAll = <E extends { readonly message: string }, R, F, S>(
  providers: Effect.Effect<ReadonlyArray<ProviderInfo>, F, S>,
  list: (provider: ProviderInfo) => Effect.Effect<ReadonlyArray<ModelInfo>, E, R>,
) => {
  const listOne = (provider: ProviderInfo) =>
    list(provider).pipe(
      Effect.map((models): ProviderModels => ({ provider, models })),
      Effect.asSome,
      Effect.catch((error) =>
        isSignedOut(error)
          ? Effect.succeedNone
          : Effect.succeedSome<ProviderModels>({ provider, models: [], failure: error.message }),
      ),
    );

  return providers.pipe(
    Effect.flatMap((each) => Effect.forEach(each, listOne)),
    Effect.map((each) => {
      const shown = each.flatMap((one) => (Option.isSome(one) ? [one.value] : []));

      return shown
        .filter((one) => one.failure === undefined)
        .concat(shown.filter((one) => one.failure !== undefined));
    }),
  );
};

/** One option's value: the model as `provider/id`, so options compare by text. */
export const modelKey = (model: ModelRef) => `${model.provider}/${model.id}`;

const failureOption = (provider: ProviderInfo, failure: string): SelectOption<string> => ({
  title: failure,
  value: `failure:${provider.id}`,
  category: provider.name,
  tone: "warning",
});

/** The section the favorite models move to, above the providers'. */
const FAVORITES = "Favorites";

/** What marks a model in the dialog: the favorites' keys, and the default model's key. */
export interface ModelMarks {
  readonly favorites: ReadonlySet<string>;
  readonly defaultKey?: string | undefined;
}

/**
 * Each model as an option, its key the value; the default model is tagged `default`. A favorite
 * sits in the Favorites section, with its provider's name before its id; the rest sit under their
 * provider's name. A provider whose list failed has the failure as its one option. Providers with
 * models come first.
 */
export const modelOptions = (listed: ReadonlyArray<ProviderModels>, marks: ModelMarks) => {
  const { favorites, defaultKey } = marks;

  const optionsOf = (wantFavorites: boolean) =>
    listed.flatMap(({ provider, models, failure }) => {
      if (failure !== undefined) return wantFavorites ? [] : [failureOption(provider, failure)];

      return models.flatMap((model): SelectOption<string>[] => {
        const value = modelKey({ provider: provider.id, id: model.id });
        if (favorites.has(value) !== wantFavorites) return [];

        const option: SelectOption<string> = {
          title: model.name,
          value,
          description: wantFavorites ? `${provider.name} · ${model.id}` : model.id,
          category: wantFavorites ? FAVORITES : provider.name,
        };

        return [value === defaultKey ? { ...option, tag: "default" } : option];
      });
    });

  return [...optionsOf(true), ...optionsOf(false)];
};

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
