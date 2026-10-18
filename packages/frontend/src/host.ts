/** The FrontendHost one UI part runs against: its registrations, kernel connection and state. */

import { Effect, Result, Scope, Stream, SubscriptionRef } from "effect";
import { type Rpc, RpcClient, type RpcClientError, type RpcGroup } from "effect/rpc";

import {
  type AnySlot,
  type ComponentKind,
  type ErasedMatcher,
  type FrontendHost,
  KernelRpcs,
  type SessionId,
  type SessionState,
} from "@liminal/sdk";

import { type Entry, register, remove, type SlotTree } from "./tree.ts";

/** A registration's options with every kind's fields optional, as the tree stores them. */
interface Placement {
  readonly priority?: number;
  readonly id?: string;
  readonly order?: number;
  readonly key?: string;
  readonly meta?: unknown;
  readonly select?: ErasedMatcher;
}

const placementOf = (options: Placement) => ({
  cell: options.key ?? options.id ?? "",
  priority: options.priority ?? 0,
  order: options.order ?? 0,
  meta: options.meta,
  select: options.select,
});

/** What the host tells the part loader about slot changes. */
export interface TreeEvents {
  /** A registration declared these child slots. */
  readonly declared: (slots: ReadonlyArray<string>) => Effect.Effect<void>;
  /** Removing a registration collapsed slots holding these plugins' entries. */
  readonly dropped: (plugins: ReadonlyMap<string, ReadonlySet<string>>) => Effect.Effect<void>;
}

/** What every part's host shares: the tree, ids, per-session state and the kernel. */
export interface HostShared<C> {
  readonly tree: SubscriptionRef.SubscriptionRef<SlotTree<C>>;
  readonly nextId: Effect.Effect<number>;
  readonly states: Map<string, Map<SessionId, unknown>>;
  readonly connect: Effect.Effect<RpcClient.Protocol["Service"], never, Scope.Scope>;
  readonly events: TreeEvents;
}

const makeSessionState = <A>(
  states: Map<string, Map<SessionId, unknown>>,
  name: string,
  initial: () => A,
): SessionState<A> => {
  const sessions = states.get(name) ?? new Map<SessionId, unknown>();
  states.set(name, sessions);

  return {
    of: (session) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the host stores only what `initial` made for this name.
      const held = sessions.get(session) as A | undefined;
      if (held !== undefined) return held;
      const made = initial();
      sessions.set(session, made);

      return made;
    },
  };
};

const unregister = <C>(shared: HostShared<C>, id: number) =>
  Effect.flatMap(
    SubscriptionRef.modify(shared.tree, (tree) => {
      const removed = remove(tree, id);

      return [removed.dropped, removed.tree];
    }),
    (dropped) => (dropped.size === 0 ? Effect.void : shared.events.dropped(dropped)),
  );

/**
 * The part's host; its kernel connection opens in the caller's Scope on first use, so a part that
 * never calls the kernel never connects.
 */
export const makeHost = Effect.fn("makeHost")(function* <K extends ComponentKind>(
  plugin: string,
  shared: HostShared<K["component"]>,
) {
  const scope = yield* Effect.scope;
  const protocol = yield* Effect.cached(shared.connect.pipe(Scope.provide(scope)));

  const kernel = yield* Effect.cached(
    Effect.flatMap(protocol, (connected) =>
      RpcClient.make(KernelRpcs).pipe(
        Effect.provideService(RpcClient.Protocol, connected),
        Scope.provide(scope),
      ),
    ),
  );

  const host: FrontendHost<K> = {
    register: Effect.fn("register")(function* (slot, options, component, declares = []) {
      const id = yield* shared.nextId;
      // RegisterOptions<S> is one of Placement's shapes for every slot kind S.
      const placement = placementOf(options);

      const entry: Entry<K["component"]> = {
        ...placement,
        id,
        plugin,
        slot: slot.name,
        component,
        declares,
      };

      const added = SubscriptionRef.modify(shared.tree, (tree) => {
        const next = register(tree, entry);

        return [Result.map(next, () => {}), Result.getOrElse(next, () => tree)];
      });

      yield* Effect.acquireRelease(Effect.flatMap(added, Effect.fromResult), () =>
        unregister(shared, id),
      );

      if (declares.length > 0)
        yield* shared.events.declared(declares.map((child: AnySlot) => child.name));
    }),
    client: <R extends Rpc.Any>(group: RpcGroup.RpcGroup<R>) =>
      // UI part groups declare no middleware, so the client needs none.
      (
        RpcClient.make(group) as Effect.Effect<
          RpcClient.RpcClient<R, RpcClientError.RpcClientError>,
          never,
          RpcClient.Protocol | Scope.Scope
        >
      ).pipe(Effect.provideServiceEffect(RpcClient.Protocol, protocol)),
    follow: (session) =>
      Stream.unwrap(Effect.map(kernel, (client) => client["kernel/follow"]({ session }))),
    sessionState: (key, initial) => makeSessionState(shared.states, `${plugin}/${key}`, initial),
  };

  return host;
});
