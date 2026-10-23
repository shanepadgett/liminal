/**
 * A session as a frontend shows it: its saved events, the deltas streaming now, whether a turn runs
 * and the inputs waiting for it.
 */
import { Effect, Predicate, Stream, SubscriptionRef } from "effect";

import { LoopRpc, type Queued } from "@shanepadgett/liminal-loop/contract";
import {
  type Delta,
  type LiveItem,
  type SessionEvent,
  type SessionId,
  type SessionNotFound,
  SessionRpc,
  type SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";

import { Host } from "./host.ts";

export interface ViewState {
  /** Saved events, oldest first: the latest page, every event since, and older pages loaded. */
  readonly events: ReadonlyArray<SessionEvent>;
  /** Every delta since the last saved event, such as the reply being written. */
  readonly streaming: ReadonlyArray<Delta>;
  readonly running: boolean;
  /** Inputs sent while a turn runs, oldest first, until the turn takes them. */
  readonly queued: ReadonlyArray<Queued>;
}

export interface SessionView {
  readonly state: SubscriptionRef.SubscriptionRef<ViewState>;
  /** Adds the page before the oldest event held; does nothing once the first event is held. */
  readonly loadOlder: Effect.Effect<void, SessionNotFound | SessionStoreFailed>;
}

const lastSeq = (events: ReadonlyArray<SessionEvent>) => events.at(-1)?.seq ?? 0;

/** `state` with `item`: a saved event clears the deltas it saves; one already held is skipped. */
const addItem = (state: ViewState, item: LiveItem): ViewState => {
  if (!Predicate.hasProperty(item, "seq")) {
    return { ...state, streaming: [...state.streaming, item] };
  }

  if (item.seq <= lastSeq(state.events)) return state;

  return { ...state, events: [...state.events, item], streaming: [] };
};

/** `state` with `older` before its events; a page loaded twice adds nothing. */
const addOlder = (state: ViewState, older: ReadonlyArray<SessionEvent>): ViewState => {
  const first = state.events[0]?.seq ?? Number.POSITIVE_INFINITY;

  return { ...state, events: [...older.filter(({ seq }) => seq < first), ...state.events] };
};

/**
 * Opens a view of `session` for the caller's scope: the latest page, then each new event, delta and
 * change of `running` and `queued`. A stream that fails later logs the error and the view stops
 * updating.
 */
export const open = Effect.fn("SessionView.open")(function* (session: SessionId) {
  const host = yield* Host;
  const sessions = yield* host.client(SessionRpc);
  const loop = yield* host.client(LoopRpc);
  const latest = yield* sessions["session/page"]({ session });

  const state = yield* SubscriptionRef.make<ViewState>({
    events: latest,
    streaming: [],
    running: false,
    queued: [],
  });

  const follow = <A, E>(
    stream: Stream.Stream<A, E>,
    add: (current: ViewState, a: A) => ViewState,
  ) =>
    stream.pipe(
      Stream.runForEach((value) => SubscriptionRef.update(state, (current) => add(current, value))),
      Effect.catchCause((cause) =>
        Effect.logError(`The view of session ${session} stopped updating.`, cause),
      ),
      Effect.forkScoped,
    );

  yield* follow(sessions["session/live"]({ session, after: lastSeq(latest) }), addItem);

  yield* follow(loop["loop/state"]({ session }), (current, { running, queued }) => ({
    ...current,
    running,
    queued,
  }));

  const loadOlder = Effect.gen(function* () {
    const first = (yield* SubscriptionRef.get(state)).events[0];
    if (first === undefined || first.seq <= 1) return;

    const older = yield* sessions["session/page"]({ session, before: first.seq });
    yield* SubscriptionRef.update(state, (current) => addOlder(current, older));
  });

  const view: SessionView = { state, loadOlder };

  return view;
});
