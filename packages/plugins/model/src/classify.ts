/** `Models.classify`: picks a classifier and asks it through its provider's decision model. */
import { Effect, Option, type Schema } from "effect";
import type { Decision } from "effect/ai";

import type { Registry } from "@shanepadgett/liminal-core";
import type { Settings } from "@shanepadgett/liminal-settings/contract";

import { findModel } from "./call.ts";
import { type ClassifyOptions, ModelNotFound, type ModelProvider } from "./contract.ts";
import { ModelSetting } from "./setting.ts";

/** The first classifier a signed-in provider lists. */
const firstListed = Effect.fn("Models.firstListed")(function* (
  providers: ReadonlyArray<ModelProvider>,
) {
  for (const { classifiers, signedIn } of providers) {
    if (classifiers !== undefined && (yield* signedIn)) {
      const [first] = yield* classifiers;
      if (first !== undefined) return Option.some(first.id);
    }
  }

  return Option.none<string>();
});

export const makeClassify = (providers: Registry<ModelProvider>, settings: Settings["Service"]) => {
  const classifierOf = Effect.fn("Models.classifierOf")(function* (model: string | undefined) {
    if (model !== undefined) return model;

    const { classifier } = yield* settings.get(ModelSetting);
    if (classifier !== undefined) return classifier;

    const listed = yield* firstListed(yield* providers.list);
    if (Option.isSome(listed)) return listed.value;

    return yield* new ModelNotFound({
      model: "classifier",
      message: "No classifier is connected. Set model.classifier or run liminal connect.",
    });
  });

  const decisionModelOf = Effect.fn("Models.decisionModelOf")(function* (
    model: string | undefined,
  ) {
    const id = yield* classifierOf(model);
    const found = yield* findModel(providers, id);
    const { decisionModel } = found.provider;

    if (decisionModel === undefined) {
      return yield* new ModelNotFound({ model: id, message: `${id} is not a classifier.` });
    }

    return yield* decisionModel(found.model);
  });

  return <Input extends Schema.Constraint, Decisions extends Record<string, Decision.Any>>(
    definition: Decision.Definition<Input, Decisions>,
    { model, ...options }: ClassifyOptions<Input>,
  ) => Effect.flatMap(decisionModelOf(model), (decisions) => decisions.decide(definition, options));
};
