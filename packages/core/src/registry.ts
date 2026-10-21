/** A collection other plugins add to; each addition lasts as long as the scope that made it. */
import { Context, Effect, Ref, type Scope } from "effect";

/** Where an item goes: lowest `order` first, default 0; ties keep the order items were added in. */
export interface Placement {
  readonly order?: number;
}

export interface Registry<T> {
  /** Adds `item`; it is removed when the caller's scope closes. */
  readonly add: (item: T, placement?: Placement) => Effect.Effect<void, never, Scope.Scope>;
  /** The items, lowest `order` first. */
  readonly list: Effect.Effect<ReadonlyArray<T>>;
}

/** One addition; removal matches on its identity, so adding the same item twice keeps both. */
interface Addition<T> {
  readonly item: T;
  readonly order: number;
}

/** An empty registry, made by the plugin that owns it. */
const make = Effect.fn("Registry.make")(function* <T>() {
  const additions = yield* Ref.make<ReadonlyArray<Addition<T>>>([]);

  const add = (item: T, placement?: Placement) => {
    const addition: Addition<T> = { item, order: placement?.order ?? 0 };

    return Effect.acquireRelease(
      Ref.update(additions, (current) =>
        [...current, addition].toSorted((left, right) => left.order - right.order),
      ),
      () => Ref.update(additions, (current) => current.filter((entry) => entry !== addition)),
    );
  };

  const registry: Registry<T> = {
    add,
    list: Effect.map(Ref.get(additions), (current) => current.map(({ item }) => item)),
  };

  return registry;
});

/**
 * A service tag whose service is a `Registry<T>`: `class Tools extends Registry.Service<Tools,
 * Tool>()("Tools") {}`.
 */
const Service =
  <Self, T>() =>
  <const Key extends string>(key: Key) =>
    Context.Service<Self, Registry<T>>()(key);

export const Registry = { make, Service };
