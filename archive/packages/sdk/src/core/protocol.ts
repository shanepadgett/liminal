/**
 * The protocol between the kernel and its clients: what crosses the wire, the session feed the
 * kernel follows, the event bus, and the kernel's own commands.
 */

import { Context, Effect, Layer, Option, PubSub, Schema, Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { ModelContent } from "./model.ts";
import { Seq, SessionId, SessionNotFound, StoreError, UserVisibility } from "./session.ts";

/** A saved entry as clients receive it; `data` is its kind's JSON, decoded by the client. */
export const SavedEntry = Schema.Struct({
  sessionId: SessionId,
  seq: Seq,
  kind: Schema.String,
  at: Schema.DateTimeUtc,
  data: Schema.Json,
  model: Schema.optionalKey(Schema.Array(ModelContent)),
  text: Schema.String,
  user: UserVisibility,
});

export type SavedEntry = typeof SavedEntry.Type;

/** Sent after the saved entries; everything after it is live. */
export class Synced extends Schema.TaggedClass<Synced, { readonly brand: unique symbol }>()(
  "Synced",
  { seq: Schema.optionalKey(Seq) },
) {}

/** A session's one transient slot, such as a streaming reply; not part of the history. */
export const LiveState = Schema.Struct({ kind: Schema.String, data: Schema.Json });
export type LiveState = typeof LiveState.Type;

/** A saved entry of a followed session. */
export const SavedEvent = Schema.TaggedStruct("Saved", { entry: SavedEntry });

/** The live slot changed; no `live` means it was cleared. */
export const LiveEvent = Schema.TaggedStruct("Live", { live: Schema.optionalKey(LiveState) });

/** What following a session delivers. */
export const FollowEvent = Schema.Union([SavedEvent, Synced, LiveEvent]);
export type FollowEvent = typeof FollowEvent.Type;

/** A session's saved entries and live slot, in the form the kernel sends to clients. */
export class SessionFeed extends Context.Service<
  SessionFeed,
  {
    /** The saved entries after `from.after`, then Synced, then each new entry as it is saved. */
    readonly follow: (
      session: SessionId,
      from: { readonly after?: Seq },
    ) => Stream.Stream<SavedEntry | Synced, SessionNotFound | StoreError>;
    /** The saved slot, then each change. */
    readonly watchLive: (
      session: SessionId,
    ) => Stream.Stream<Option.Option<LiveState>, SessionNotFound | StoreError>;
  }
>()("liminal/sdk/SessionFeed") {}

/** No active plugin provides the SessionFeed, so no session can be followed. */
export class FeedMissing extends Schema.TaggedError<
  FeedMissing,
  { readonly brand: unique symbol }
>()("FeedMissing", {}) {}

/** An event on the bus as clients receive it; `data` is decoded with its definition. */
export const BusEvent = Schema.Struct({ name: Schema.String, data: Schema.Json });
export type BusEvent = typeof BusEvent.Type;

/** An event kind; events are observe-only and safe to lose, never session content. */
export interface EventDefinition<A> {
  /** Prefixed with the defining plugin's name, such as `session-log/sessions-changed`. */
  readonly name: string;
  readonly data: Schema.Codec<A, Schema.Json>;
}

/** Defines an event kind in a plugin's contract. */
export const defineEvent = <A>(definition: EventDefinition<A>): EventDefinition<A> => definition;

/** The kernel event bus, given to every plugin as a base service. */
export class EventBus extends Context.Service<
  EventBus,
  {
    readonly publish: <A>(event: EventDefinition<A>, value: A) => Effect.Effect<void>;
    /** Events published from now on; a slow reader loses the oldest. */
    readonly events: Stream.Stream<BusEvent>;
  }
>()("liminal/sdk/EventBus") {
  /** An in-process bus; the kernel provides one, tests another. */
  static readonly layer = Layer.effect(
    EventBus,
    Effect.gen(function* () {
      const pubsub = yield* PubSub.sliding<BusEvent>(256);

      return EventBus.of({
        publish: (event, value) =>
          Schema.encodeEffect(event.data)(value).pipe(
            Effect.flatMap((data) => PubSub.publish(pubsub, { name: event.name, data })),
            Effect.asVoid,
            // A value that does not encode is the publisher's bug.
            Effect.orDie,
          ),
        events: Stream.fromPubSub(pubsub),
      });
    }),
  );
}

/** An active plugin as clients see it. */
export const ActivePlugin = Schema.TaggedStruct("Active", { name: Schema.String });

/** An inactive plugin and why, as one line of text. */
export const InactivePlugin = Schema.TaggedStruct("Inactive", {
  name: Schema.String,
  reason: Schema.String,
});

/** A plugin's state as clients see it. */
export const PluginState = Schema.Union([ActivePlugin, InactivePlugin]);

export type PluginState = typeof PluginState.Type;

/** An active plugin and its build number, which changes each time the plugin is rebuilt. */
export const GraphPlugin = Schema.Struct({ name: Schema.String, build: Schema.Int });

export type GraphPlugin = typeof GraphPlugin.Type;

/** The running code is the newest checked code. */
export const ReloadCurrent = Schema.TaggedStruct("Current", {});

/** Changed code is being checked out of sight. */
export const ReloadChecking = Schema.TaggedStruct("Checking", {});

/** Changed code passed its check and waits for the reload command; `restart` needs a new process. */
export const ReloadReady = Schema.TaggedStruct("Ready", { restart: Schema.Boolean });

/** Changed code failed its check; the running code stays. */
export const ReloadFailed = Schema.TaggedStruct("Failed", { reason: Schema.String });

/** Checked code applies once no turn runs. */
export const ReloadApplying = Schema.TaggedStruct("Applying", {});

/** Where the kernel is in picking up changed code. */
export const ReloadState = Schema.Union([
  ReloadCurrent,
  ReloadChecking,
  ReloadReady,
  ReloadFailed,
  ReloadApplying,
]);

export type ReloadState = typeof ReloadState.Type;

/** The kernel's own commands, served beside every active plugin's group. */
export class KernelRpcs extends RpcGroup.make(
  Rpc.make("kernel/follow", {
    payload: { session: SessionId, after: Schema.optionalKey(Seq) },
    success: FollowEvent,
    error: Schema.Union([SessionNotFound, StoreError, FeedMissing]),
    stream: true,
  }),
  Rpc.make("kernel/events", { success: BusEvent, stream: true }),
  Rpc.make("kernel/plugins", { success: Schema.Array(PluginState) }),
  /** The active plugins, then the set after each graph change. */
  Rpc.make("kernel/graph", { success: Schema.Array(GraphPlugin), stream: true }),
  /** The reload state, then each change. */
  Rpc.make("kernel/reload", { success: ReloadState, stream: true }),
  /** Applies checked code once no turn runs; does nothing unless code is ready. */
  Rpc.make("kernel/reload-now"),
) {}
