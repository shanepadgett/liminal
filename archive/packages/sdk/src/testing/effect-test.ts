/** Runs a scoped Effect as a bun:test case, with the TestClock in place of the real clock. */

import { test } from "bun:test";

import { Effect, Layer, type Scope } from "effect";
import { TestClock } from "effect/testing";

/**
 * The test fails if the Effect fails or dies. `layer` supplies what it needs, such as
 * `testBaseServices`; pass `Layer.empty` when it needs nothing. Both close when the test ends.
 */
export const effectTest = <E, R, LayerError>(
  name: string,
  effect: Effect.Effect<void, E, Scope.Scope | TestClock.TestClock | R>,
  layer: Layer.Layer<R, LayerError>,
): void => {
  test(name, () =>
    // oxlint-disable-next-line liminal/no-effect-run -- bun:test runs Promises; this is the test edge.
    Effect.runPromise(
      effect.pipe(
        Effect.scoped,
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- each test is an entry point.
        Effect.provide(Layer.merge(layer, TestClock.layer())),
      ),
    ),
  );
};
