/**
 * Ordered middleware that plugins add to, kept in a `Registry`. Each middleware wraps the rest of
 * the chain; `next` takes no input, so no middleware can rewrite what the chain runs on.
 */

import type { Effect } from "effect";

/** Runs around the rest of the chain; returns `next` to pass through, or its own result. */
export type Middleware<In, Out, E> = (
  input: In,
  next: Effect.Effect<Out, E>,
) => Effect.Effect<Out, E>;

/** Runs `input` through `middlewares`, first outermost, ending in `last`. */
export const run = <In, Out, E>(
  middlewares: ReadonlyArray<Middleware<In, Out, E>>,
  input: In,
  last: (input: In) => Effect.Effect<Out, E>,
): Effect.Effect<Out, E> => {
  let next = last(input);

  for (const middleware of middlewares.toReversed()) next = middleware(input, next);

  return next;
};
