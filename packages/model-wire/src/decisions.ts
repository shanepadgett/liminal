/** OpenAI's Decisions API through Effect AI, for every provider that speaks it. */
import { OpenAiClient, OpenAiDecisionModel } from "@effect/ai-openai";
import { Effect } from "effect";

/** Where to send Decisions calls and how to sign them. */
export type DecisionsOptions = OpenAiClient.Options;

/** An Effect AI decision model for the classifier `model` on a Decisions API. */
export const decisionsModel = Effect.fn("decisionsModel")(function* (
  options: DecisionsOptions,
  model: string,
) {
  const client = yield* OpenAiClient.make(options);

  return yield* OpenAiDecisionModel.make({ model }).pipe(
    Effect.provideService(OpenAiClient.OpenAiClient, client),
  );
});
