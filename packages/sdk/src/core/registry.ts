/** Ordered collections that plugins add to; each addition is removed when its plugin's scope closes. */

import { Context, Effect, Layer, type Scope, Stream, SubscriptionRef } from "effect";

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
}

const itemsOf = <A>(registrations: ReadonlyArray<Registration<A>>): ReadonlyArray<A> =>
  registrations.map((registration) => registration.item);

export const make = Effect.fn("Registry.make")(function* <A>() {
  const ref = yield* SubscriptionRef.make<ReadonlyArray<Registration<A>>>([]);

  const register = (item: A, options: { readonly order: number }) => {
    const registration: Registration<A> = { item, order: options.order };

    return Effect.acquireRelease(
      SubscriptionRef.update(ref, (current) =>
        [...current, registration].toSorted((left, right) => left.order - right.order),
      ),
      () =>
        SubscriptionRef.update(ref, (current) => current.filter((entry) => entry !== registration)),
    );
  };

  const registry: Registry<A> = {
    register,
    list: Effect.map(SubscriptionRef.get(ref), itemsOf),
    changes: SubscriptionRef.changes(ref).pipe(Stream.map(itemsOf)),
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
