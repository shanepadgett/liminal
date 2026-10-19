/**
 * Ordered collections that plugins add to; each addition is removed when its plugin's scope closes.
 * A caller sees only the additions of the builds in the graph it holds.
 */

import { Context, Effect, Layer, type Option, type Scope, Stream, SubscriptionRef } from "effect";

import { addRegistration, visibleIn } from "./build-scope.ts";

export interface Registry<A> {
  /** Adds `item`, sorted by `order`; removed when the caller's Scope closes. */
  readonly register: (
    item: A,
    options: { readonly order: number },
  ) => Effect.Effect<void, never, Scope.Scope>;
  /** The items sorted by order, ties in registration order. */
  readonly list: Effect.Effect<ReadonlyArray<A>>;
  /** The current items, then the items after each change. */
  readonly changes: Stream.Stream<ReadonlyArray<A>>;
}

/** One registration; its identity is what removal matches on. */
interface Registration<A> {
  readonly item: A;
  readonly order: number;
  readonly build: Option.Option<number>;
}

const itemsOf = <A>(registrations: ReadonlyArray<Registration<A>>): ReadonlyArray<A> =>
  registrations.map((registration) => registration.item);

export const make = Effect.fn("Registry.make")(function* <A>() {
  const ref = yield* SubscriptionRef.make<ReadonlyArray<Registration<A>>>([]);

  const register = (item: A, options: { readonly order: number }) =>
    addRegistration(
      ref,
      (build): Registration<A> => ({ item, order: options.order, build }),
      (current, added) => [...current, added].toSorted((left, right) => left.order - right.order),
    );

  const visible = visibleIn(ref);

  const registry: Registry<A> = {
    register,
    list: Effect.map(visible.current, itemsOf),
    changes: Stream.map(visible.changes, itemsOf),
  };

  return registry;
});

/** A `Context.Service` tag whose implementation is a `Registry<A>`. */
export const Service =
  <Self, A>() =>
  <const Key extends string>(key: Key) =>
    Context.Service<Self, Registry<A>>()(key);

/** The owning plugin's empty registry for `tag`. */
export const layer = <Self, A>(tag: Context.Service<Self, Registry<A>>): Layer.Layer<Self> =>
  Layer.effect(tag, make<A>());
