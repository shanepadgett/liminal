/**
 * The model picker's options, every active provider's models with one section per provider, and the
 * thinking picker's options for the model picked.
 */

import { Effect, Schema } from "effect";

import {
  ModelError,
  type ModelInfo,
  type ModelRef,
  type ProviderInfo,
  type ThinkingOption,
  thinkingOptionOf,
} from "@liminal/sdk";
import type { SelectOption } from "@liminal/sdk/tui";

/** Why a provider lists no models: it needs a sign-in, or its list failed with `text`. */
export interface Notice {
  readonly text: string;
  readonly isSignIn: boolean;
}

/** A provider and the models it lists, or the notice saying why it lists none. */
export interface ProviderModels {
  readonly provider: ProviderInfo;
  readonly models: ReadonlyArray<ModelInfo>;
  readonly notice?: Notice;
}

const isModelError = Schema.is(ModelError);

/** A missing login asks for a sign-in; any other failure shows its message. */
const noticeOf = (error: { readonly message: string }): Notice =>
  isModelError(error) && error.reason === "auth"
    ? { text: "Sign in with /connect", isSignIn: true }
    : { text: error.message, isSignIn: false };

/** A listed model and the reference that names it. */
export interface PickedModel {
  readonly ref: ModelRef;
  readonly info: ModelInfo;
}

/**
 * Every provider with the models it lists. A provider that cannot list its models, such as one not
 * logged in, comes with the notice saying why.
 */
export const listAll = <E extends { readonly message: string }, R, F, S>(
  providers: Effect.Effect<ReadonlyArray<ProviderInfo>, F, S>,
  list: (provider: ProviderInfo) => Effect.Effect<ReadonlyArray<ModelInfo>, E, R>,
) => {
  const listOne = (provider: ProviderInfo) =>
    list(provider).pipe(
      Effect.map((models): ProviderModels => ({ provider, models })),
      Effect.catch((error) =>
        Effect.succeed<ProviderModels>({ provider, models: [], notice: noticeOf(error) }),
      ),
    );

  return providers.pipe(
    Effect.flatMap((each) => Effect.forEach(each, listOne)),
    Effect.map((each) =>
      each
        .filter((one) => one.notice === undefined)
        .concat(each.filter((one) => one.notice !== undefined)),
    ),
  );
};

/** One option's value: the model as `provider/id`, so options compare by text. */
export const modelKey = (model: ModelRef) => `${model.provider}/${model.id}`;

/** The value of a provider's sign-in row. */
const signInKey = (provider: ProviderInfo) => `sign-in:${provider.id}`;

const noticeOption = (provider: ProviderInfo, notice: Notice): SelectOption<string> => ({
  title: notice.text,
  value: notice.isSignIn ? signInKey(provider) : `notice:${provider.id}`,
  category: provider.name,
  tone: notice.isSignIn ? "notice" : "warning",
});

/**
 * Each model as an option under its provider's name, its key the value; a provider that lists none
 * has its notice as its one option. Providers with models come first.
 */
export const modelOptions = (listed: ReadonlyArray<ProviderModels>) =>
  listed.flatMap(({ provider, models, notice }) =>
    notice === undefined
      ? models.map((model): SelectOption<string> => ({
          title: model.name,
          value: modelKey({ provider: provider.id, id: model.id }),
          description: model.id,
          category: provider.name,
        }))
      : [noticeOption(provider, notice)],
  );

/** Whether `key` is a sign-in row's. */
export const isSignIn = (listed: ReadonlyArray<ProviderModels>, key: string) =>
  listed.some(({ provider, notice }) => notice?.isSignIn === true && signInKey(provider) === key);

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
