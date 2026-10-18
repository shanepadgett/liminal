/**
 * Loads each active plugin's UI part and keeps the set current: a part runs its setup in its own
 * Scope, closes when its plugin leaves or is rebuilt, and runs again once a slot it needs is
 * declared. One fiber applies every change in order.
 */

import {
  Cause,
  type Context,
  Data,
  Effect,
  Exit,
  Option,
  Predicate,
  Queue,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import type { RpcClient } from "effect/rpc";

import {
  type ComponentKind,
  type FrontendHost,
  type FrontendPart,
  type GraphMember,
  type PartModule,
  RootSlot,
  type SessionId,
  SlotConflict,
  SlotUndeclared,
} from "@liminal/sdk";

import { type HostShared, makeHost } from "./host.ts";
import { PartFailure, PartStatus } from "./status.ts";
import { makeTree, type SlotTree } from "./tree.ts";

/** A loaded part's `setup`, as the loader runs it once the host service is provided. */
type Setup<H> = FrontendPart<H>["setup"];

const isEffect = (input: unknown): input is Setup<never> => Effect.isEffect(input);

const PartSchema = Schema.Struct({
  default: Schema.Struct({ setup: Schema.declare(isEffect, { title: "Effect" }) }),
});

type Change = Data.TaggedEnum<{
  Graph: { readonly members: ReadonlyArray<GraphMember> };
  Declared: { readonly slots: ReadonlyArray<string> };
  Dropped: { readonly plugins: ReadonlyMap<string, ReadonlySet<string>> };
}>;

const Change = Data.taggedEnum<Change>();

export interface FrontendOptions<K extends ComponentKind, H> {
  /** The kernel's active plugins, then each new set. */
  readonly graph: Stream.Stream<ReadonlyArray<GraphMember>>;
  /** A new kernel connection, closed with the caller's Scope. */
  readonly connect: Effect.Effect<RpcClient.Protocol["Service"], never, Scope.Scope>;
  /** Every service a part's `setup` reads, given the part's own host. */
  readonly services: (host: FrontendHost<K>) => Context.Context<H>;
  /** The member's module for this frontend's part, if it has one. */
  readonly part: (member: GraphMember) => PartModule | undefined;
}

export interface Frontend<C> {
  /** The current slot tree, then each change. */
  readonly tree: Stream.Stream<SlotTree<C>>;
  /** Every loaded part's status, then each change. */
  readonly statuses: Stream.Stream<ReadonlyMap<string, PartStatus>>;
}

/** A loaded part: the build it came from and its setup. */
interface Loaded<H> {
  readonly build: number;
  readonly setup: Setup<H>;
}

const failureOf = (cause: Cause.Cause<Cause.YieldableError>): PartFailure => {
  const error = Cause.findErrorOption(cause).pipe(Option.getOrUndefined);
  if (error instanceof SlotConflict) return PartFailure.Conflict({ error });
  if (error instanceof SlotUndeclared) return PartFailure.Undeclared({ error });

  return PartFailure.SetupFailed({ cause });
};

/** Every part module is `defineTui(...)` or another frontend's equivalent for this host. */
const setupOf = (module: PartModule) =>
  Schema.decodeUnknownEffect(PartSchema)(module).pipe(Effect.map((part) => part.default.setup));

/** What the loader's steps share; one fiber applies every change, so `parts` needs no lock. */
interface Loader<K extends ComponentKind, H> {
  readonly options: FrontendOptions<K, H>;
  readonly root: Scope.Scope;
  readonly tree: SubscriptionRef.SubscriptionRef<SlotTree<K["component"]>>;
  readonly statuses: SubscriptionRef.SubscriptionRef<ReadonlyMap<string, PartStatus>>;
  readonly shared: HostShared<K["component"]>;
  readonly parts: Map<string, Loaded<H>>;
  /** Each running part's Scope, holding its setup's registrations. */
  readonly scopes: Map<string, Scope.Closeable>;
}

type Statuses = Pick<Loader<ComponentKind, never>, "statuses">;
type Scopes = Pick<Loader<ComponentKind, never>, "scopes">;

const setStatus = (loader: Statuses, name: string, status: PartStatus | undefined) =>
  SubscriptionRef.update(loader.statuses, (current) => {
    const next = new Map(current);

    if (status === undefined) next.delete(name);
    else next.set(name, status);

    return next;
  });

const stop = Effect.fn("stop")(function* (loader: Scopes, name: string) {
  const scope = loader.scopes.get(name);
  loader.scopes.delete(name);
  if (scope !== undefined) yield* Scope.close(scope, Exit.void);
});

const run = Effect.fn("run")(function* <K extends ComponentKind, H>(
  loader: Loader<K, H>,
  name: string,
  part: Loaded<H>,
) {
  yield* stop(loader, name);
  const scope = yield* Scope.fork(loader.root);

  const exit = yield* Effect.exit(
    Effect.gen(function* () {
      const host = yield* makeHost<K>(name, loader.shared);

      yield* part.setup.pipe(Effect.provideContext(loader.options.services(host)));
    }).pipe(Scope.provide(scope)),
  );

  if (Exit.isFailure(exit)) {
    yield* Scope.close(scope, exit);

    return yield* setStatus(loader, name, PartStatus.Failed({ failure: failureOf(exit.cause) }));
  }

  loader.scopes.set(name, scope);

  return yield* setStatus(loader, name, PartStatus.Running());
});

const leave = Effect.fn("leave")(function* <K extends ComponentKind, H>(
  loader: Loader<K, H>,
  name: string,
) {
  const part = loader.parts.get(name);
  loader.parts.delete(name);
  if (part !== undefined) yield* stop(loader, name);
  yield* setStatus(loader, name, undefined);
});

const enter = Effect.fn("enter")(function* <K extends ComponentKind, H>(
  loader: Loader<K, H>,
  member: GraphMember,
  module: PartModule,
) {
  const setup = yield* Effect.exit(setupOf(module));

  if (Exit.isFailure(setup)) {
    const failure = PartFailure.Invalid({ cause: setup.cause });

    return yield* setStatus(loader, member.name, PartStatus.Failed({ failure }));
  }

  const part: Loaded<H> = { build: member.build, setup: setup.value };
  loader.parts.set(member.name, part);

  return yield* run(loader, member.name, part);
});

const onGraph = Effect.fn("onGraph")(function* <K extends ComponentKind, H>(
  loader: Loader<K, H>,
  members: ReadonlyArray<GraphMember>,
) {
  const builds = new Map(members.map((member) => [member.name, member.build]));

  for (const [name, part] of loader.parts)
    if (builds.get(name) !== part.build) yield* leave(loader, name);

  for (const member of members) {
    const module = loader.options.part(member);

    if (module !== undefined && !loader.parts.has(member.name))
      yield* enter(loader, member, module);
  }
});

const waitsOn = (loader: Statuses, name: string, slots: ReadonlyArray<string>) =>
  Effect.map(SubscriptionRef.get(loader.statuses), (current) => {
    const status = current.get(name);
    if (status === undefined || !Predicate.isTagged(status, "Failed")) return false;
    const { failure } = status;

    return Predicate.isTagged(failure, "Undeclared") && slots.includes(failure.error.slot);
  });

const onDeclared = Effect.fn("onDeclared")(function* <K extends ComponentKind, H>(
  loader: Loader<K, H>,
  slots: ReadonlyArray<string>,
) {
  for (const [name, part] of loader.parts)
    if (yield* waitsOn(loader, name, slots)) yield* run(loader, name, part);
});

const onDropped = Effect.fn("onDropped")(function* <K extends ComponentKind, H>(
  loader: Loader<K, H>,
  plugins: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const { declared } = yield* SubscriptionRef.get(loader.tree);

  for (const [name, slots] of plugins) {
    const part = loader.parts.get(name);
    if (part === undefined) continue;
    const missing = [...slots].find((slot) => !declared.has(slot));

    if (missing === undefined) {
      yield* run(loader, name, part);
      continue;
    }

    yield* stop(loader, name);
    const failure = PartFailure.Undeclared({ error: new SlotUndeclared({ slot: missing }) });
    yield* setStatus(loader, name, PartStatus.Failed({ failure }));
  }
});

const sharedOf = <C>(
  tree: SubscriptionRef.SubscriptionRef<SlotTree<C>>,
  connect: FrontendOptions<ComponentKind, unknown>["connect"],
  changes: Queue.Queue<Change>,
): HostShared<C> => {
  let lastId = 0;

  return {
    tree,
    nextId: Effect.sync(() => ++lastId),
    states: new Map<string, Map<SessionId, unknown>>(),
    connect,
    events: {
      declared: (slots) => Queue.offer(changes, Change.Declared({ slots })).pipe(Effect.asVoid),
      dropped: (plugins) => Queue.offer(changes, Change.Dropped({ plugins })).pipe(Effect.asVoid),
    },
  };
};

/** Starts the part loader; it runs until the caller's Scope closes. */
export const startFrontend = Effect.fn("startFrontend")(function* <K extends ComponentKind, H>(
  options: FrontendOptions<K, H>,
) {
  const tree = yield* SubscriptionRef.make<SlotTree<K["component"]>>(makeTree([RootSlot]));
  const changes = yield* Queue.unbounded<Change>();

  const loader: Loader<K, H> = {
    options,
    root: yield* Effect.scope,
    tree,
    statuses: yield* SubscriptionRef.make<ReadonlyMap<string, PartStatus>>(new Map()),
    shared: sharedOf(tree, options.connect, changes),
    parts: new Map(),
    scopes: new Map(),
  };

  const apply = Change.$match({
    Graph: ({ members }) => onGraph(loader, members),
    Declared: ({ slots }) => onDeclared(loader, slots),
    Dropped: ({ plugins }) => onDropped(loader, plugins),
  });

  yield* options.graph.pipe(
    Stream.runForEach((members) => Queue.offer(changes, Change.Graph({ members }))),
    Effect.forkScoped,
  );

  yield* Queue.take(changes).pipe(Effect.flatMap(apply), Effect.forever, Effect.forkScoped);

  const frontend: Frontend<K["component"]> = {
    tree: SubscriptionRef.changes(tree),
    statuses: SubscriptionRef.changes(loader.statuses),
  };

  return frontend;
});
