/**
 * What a frontend gives each plugin's UI part, independent of how the frontend renders: slot
 * registration, a kernel client, session following, per-session state and kept values.
 */

import type { Cause, Effect, Schema, Scope, Stream } from "effect";
import type { Rpc, RpcClient, RpcClientError, RpcGroup } from "effect/rpc";

import type { FeedMissing, FollowEvent } from "./protocol.ts";
import type { SessionId, SessionNotFound, StoreError } from "./session.ts";
import type { AnySlot, PropsOf, RegisterOptions, SlotConflict, SlotUndeclared } from "./slot.ts";

/**
 * A renderer's component type as a function of its props. A renderer extends this with `component`
 * written in terms of `this["props"]`.
 */
export interface ComponentKind {
  readonly props: unknown;
  readonly component: unknown;
}

/** The renderer's component type for props `P`. */
export type ComponentOf<K extends ComponentKind, P> = (K & { readonly props: P })["component"];

/** Why following a session through the kernel failed. */
export type FollowError =
  | SessionNotFound
  | StoreError
  | FeedMissing
  | RpcClientError.RpcClientError;

/** State the host keeps per session id, for as long as the frontend runs. */
export interface SessionState<A> {
  readonly of: (session: SessionId) => A;
}

/**
 * A value the host keeps across the part's reloads, and hands to the next process when the app
 * restarts.
 */
export interface Kept<A> {
  readonly get: () => A;
  readonly set: (value: A) => void;
}

export interface FrontendHost<K extends ComponentKind> {
  /**
   * Adds `component` to the slot, and declares the child slots it owns. Removed when the caller's
   * Scope closes; the child slots collapse with it.
   */
  readonly register: <S extends AnySlot>(
    slot: S,
    options: RegisterOptions<S>,
    component: ComponentOf<K, PropsOf<S>>,
    declares?: ReadonlyArray<AnySlot>,
  ) => Effect.Effect<void, SlotConflict | SlotUndeclared, Scope.Scope>;
  /** A client for an RPC group over this part's own kernel connection. */
  readonly client: <R extends Rpc.Any>(
    group: RpcGroup.RpcGroup<R>,
  ) => Effect.Effect<RpcClient.RpcClient<R, RpcClientError.RpcClientError>, never, Scope.Scope>;
  /** A session's saved entries, then Synced, then new entries and live changes. */
  readonly follow: (session: SessionId) => Stream.Stream<FollowEvent, FollowError>;
  /**
   * The state named `key` for each session, made by `initial` on first use; it survives the part
   * reloading.
   */
  readonly sessionState: <A>(key: string, initial: (session: SessionId) => A) => SessionState<A>;
  /**
   * The value named `key`: the one handed over by the process before a restart when `schema`
   * decodes it, else made by `initial` on first use.
   */
  readonly keep: <A>(
    key: string,
    schema: Schema.Codec<A, Schema.Json>,
    initial: () => A,
  ) => Kept<A>;
}

/**
 * A plugin's UI part: run once each time the part loads, in a Scope that closes when it unloads.
 * Each plugin fails with its own tagged errors.
 */
export interface FrontendPart<Host> {
  readonly setup: Effect.Effect<void, Cause.YieldableError, Host | Scope.Scope>;
}
