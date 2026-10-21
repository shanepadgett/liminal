/** Tool output's server: the long-output service and the outermost tool wrapper, which uses it. */

import { Effect, Layer } from "effect";

import { ToolWrappers } from "@liminal/tools/contract";

import { LongOutput } from "./contract.ts";
import { makeLongOutput, spillWrapper } from "./server/spill.ts";

/** Outermost, so it sees the outcome every other wrapper left. */
const order = 0;

const spill = Layer.effectDiscard(
  Effect.gen(function* () {
    const wrapper = yield* spillWrapper;
    yield* (yield* ToolWrappers).register(wrapper, { order });
  }),
);

export const layer = spill.pipe(Layer.provideMerge(Layer.effect(LongOutput, makeLongOutput)));
