/** An operation other plugins wrap with middleware; kept in a `Registry`. */
import { Context, Effect, type Scope } from "effect";

import { type Placement, Registry } from "./registry.ts";

/** Runs around the rest of the chain. It may rewrite the input it passes to `next`. */
export type Middleware<In, Out, E> = (
  input: In,
  next: (input: In) => Effect.Effect<Out, E>,
) => Effect.Effect<Out, E>;

export interface Pipeline<In, Out, E> {
  /**
   * Adds `middleware`; it is removed when the caller's scope closes. Lower `order` runs outer: it
   * sees the input first and the output last.
   */
  readonly wrap: (
    middleware: Middleware<In, Out, E>,
    placement?: Placement,
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly run: (input: In) => Effect.Effect<Out, E>;
}

/** `middlewares` around `terminal`, the first outermost. */
const chain = <In, Out, E>(
  middlewares: ReadonlyArray<Middleware<In, Out, E>>,
  terminal: (input: In) => Effect.Effect<Out, E>,
): ((input: In) => Effect.Effect<Out, E>) => {
  const [outer, ...inner] = middlewares;
  if (outer === undefined) return terminal;

  const next = chain(inner, terminal);

  return (input) => outer(input, next);
};

/** A pipeline with no middleware, made by the plugin that owns it; `terminal` does the work. */
const make = Effect.fn("Pipeline.make")(function* <In, Out, E>(
  terminal: (input: In) => Effect.Effect<Out, E>,
) {
  const middlewares = yield* Registry.make<Middleware<In, Out, E>>();

  const pipeline: Pipeline<In, Out, E> = {
    wrap: middlewares.add,
    run: (input) => Effect.flatMap(middlewares.list, (current) => chain(current, terminal)(input)),
  };

  return pipeline;
});

/** A service tag whose service is a `Pipeline<In, Out, E>`. */
const Service =
  <Self, In, Out, E = never>() =>
  <const Key extends string>(key: Key) =>
    Context.Service<Self, Pipeline<In, Out, E>>()(key);

export const Pipeline = { make, Service };
