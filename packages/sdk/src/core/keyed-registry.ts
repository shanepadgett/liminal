/**
 * Named collections that plugins add to. The newest addition under a name wins, so a rebuilt
 * plugin's items take over from its old build's while both are registered.
 */

import { Context, Effect, Layer, Option, type Scope, Stream, SubscriptionRef } from "effect";

export interface KeyedRegistry<A> {
  /** Adds `item` under its name; removed when the caller's Scope closes. */
  readonly register: (item: A) => Effect.Effect<void, never, Scope.Scope>;
  /** The newest item registered under `name`. */
  readonly get: (name: string) => Effect.Effect<Option.Option<A>>;
  /** The newest item under each name, sorted by name. */
  readonly list: Effect.Effect<ReadonlyArray<A>>;
  /** The current items, then the items after each change. */
  readonly changes: Stream.Stream<ReadonlyArray<A>>;
}

/** One registration; its identity is what removal matches on. */
interface Registration<A> {
  readonly name: string;
  readonly item: A;
}

/** The last registration under each name, sorted by name. */
const newestOf = <A>(registrations: ReadonlyArray<Registration<A>>): ReadonlyArray<A> => {
  const newest = new Map<string, A>();
  for (const registration of registrations) newest.set(registration.name, registration.item);

  return [...newest.keys()].toSorted().flatMap((name) => {
    const item = newest.get(name);

    return item === undefined ? [] : [item];
  });
};

const make = Effect.fn("KeyedRegistry.make")(function* <A>(nameOf: (item: A) => string) {
  const ref = yield* SubscriptionRef.make<ReadonlyArray<Registration<A>>>([]);

  const register = (item: A) => {
    const registration: Registration<A> = { name: nameOf(item), item };

    return Effect.acquireRelease(
      SubscriptionRef.update(ref, (current) => [...current, registration]),
      () =>
        SubscriptionRef.update(ref, (current) => current.filter((entry) => entry !== registration)),
    );
  };

  const get = (name: string) =>
    Effect.map(SubscriptionRef.get(ref), (registrations) =>
      Option.fromUndefinedOr(registrations.findLast((entry) => entry.name === name)?.item),
    );

  const registry: KeyedRegistry<A> = {
    register,
    get,
    list: Effect.map(SubscriptionRef.get(ref), newestOf),
    changes: SubscriptionRef.changes(ref).pipe(Stream.map(newestOf)),
  };

  return registry;
});

/** A `Context.Service` tag whose implementation is a `KeyedRegistry<A>`. */
export const Service =
  <Self, A>() =>
  <const Key extends string>(key: Key) =>
    Context.Service<Self, KeyedRegistry<A>>()(key);

/** The owning plugin's empty registry for `tag`, naming each item with `nameOf`. */
export const layer = <Self, A>(
  tag: Context.Service<Self, KeyedRegistry<A>>,
  nameOf: (item: A) => string,
): Layer.Layer<Self> => Layer.effect(tag, make(nameOf));
