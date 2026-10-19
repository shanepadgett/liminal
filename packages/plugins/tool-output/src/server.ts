/** Tool output's server: the outermost tool wrapper, which spills long output to a file. */

import { Effect, Layer } from "effect";

import { ToolWrappers } from "@liminal/tools/contract";

import { spillWrapper } from "./server/spill.ts";

/** Outermost, so it sees the outcome every other wrapper left. */
const order = 0;

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const wrapper = yield* spillWrapper;
    yield* (yield* ToolWrappers).register(wrapper, { order });
  }),
);
