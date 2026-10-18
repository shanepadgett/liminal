/** Cache-hints' server: registers the step that marks each request. */

import { Effect, Layer } from "effect";

import { RequestSteps } from "@liminal/context/contract";

import { marksOf } from "./server/marks.ts";

/** Last, so the marks land on the request every other step has finished rewriting. */
const order = 1000;

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const steps = yield* RequestSteps;

    yield* steps.register((_sessionId, request) => Effect.succeed(marksOf(request)), { order });
  }),
);
