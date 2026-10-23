/**
 * Each session's queued inputs and whether something runs in it, behind one lock, so an input can
 * never slip in between a turn deciding to end and the session going idle.
 */
import {
  Deferred,
  Effect,
  Exit,
  type Fiber,
  Option,
  Ref,
  Semaphore,
  Stream,
  SubscriptionRef,
} from "effect";

import type { Attributes } from "@shanepadgett/liminal-core";
import type {
  EventInvalid,
  NewEvent,
  SessionId,
  SessionLog,
  SessionNotFound,
  SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";

import {
  type Input,
  type LoopState,
  type Queued,
  type SendMode,
  TurnEnded,
  TurnStarted,
} from "./contract.ts";
import { closeUnfinished } from "./recovery.ts";

/** A turn or a fold; `done` completes when the session goes idle. */
interface Running {
  readonly done: Deferred.Deferred<void>;
  /** The step the turn runs now, which a cancel interrupts. */
  readonly step: Option.Option<Fiber.Fiber<unknown, unknown>>;
}

interface SessionState {
  readonly queue: ReadonlyArray<Queued>;
  readonly running: Option.Option<Running>;
}

type LogError = SessionNotFound | SessionStoreFailed | EventInvalid;

export type Outcome = typeof TurnEnded.schema.Type.outcome;

const idle: SessionState = { queue: [], running: Option.none() };

/** The state behind the lock; every function below runs while holding it. */
interface Store {
  readonly log: SessionLog["Service"];
  /** A `SubscriptionRef`, so viewers follow each session's state. */
  readonly states: SubscriptionRef.SubscriptionRef<ReadonlyMap<SessionId, SessionState>>;
  /** Sessions checked for a turn a crash left unfinished, in this process. */
  readonly checked: Ref.Ref<ReadonlySet<SessionId>>;
}

const stateOf = (store: Store, session: SessionId) =>
  Effect.map(SubscriptionRef.get(store.states), (all) => all.get(session) ?? idle);

const updateState = (
  store: Store,
  session: SessionId,
  change: (state: SessionState) => SessionState,
) =>
  SubscriptionRef.update(store.states, (all) =>
    new Map(all).set(session, change(all.get(session) ?? idle)),
  );

/** What viewers see of `state`. */
const viewOf = (state: SessionState): LoopState => ({
  running: Option.isSome(state.running),
  queued: state.queue,
});

/** Whether viewers would see the same; a turn's next step changes nothing they see. */
const looksSame = (before: SessionState, after: SessionState) =>
  Option.isSome(before.running) === Option.isSome(after.running) && before.queue === after.queue;

const closeOnce = Effect.fn("Loop.closeOnce")(function* (store: Store, session: SessionId) {
  if ((yield* Ref.get(store.checked)).has(session)) return;

  yield* closeUnfinished(store.log, session);
  yield* Ref.update(store.checked, (all) => new Set(all).add(session));
});

/** Marks the session running; false when something already runs in it. */
const claim = Effect.fn("Loop.claim")(function* (store: Store, session: SessionId) {
  yield* closeOnce(store, session);
  if (Option.isSome((yield* stateOf(store, session)).running)) return false;

  const running: Running = { done: yield* Deferred.make<void>(), step: Option.none() };
  yield* updateState(store, session, (state) => ({ ...state, running: Option.some(running) }));

  return true;
});

/**
 * Which waiting inputs to take: the steers before a model call, or the whole queue to go on with
 * the same turn or to start a new one.
 */
type Taking = "steers" | "same-turn" | "new-turn";

/** Takes the inputs `taking` names and logs them, after `loop/turn-start` for a new turn. */
const take = Effect.fn("Loop.take")(function* (store: Store, session: SessionId, taking: Taking) {
  const { queue } = yield* stateOf(store, session);
  const taken = queue.filter(({ mode }) => taking !== "steers" || mode === "steer");
  const rest = queue.filter((item) => !taken.includes(item));
  yield* updateState(store, session, (state) => ({ ...state, queue: rest }));

  const [first, ...later] = taken.map(({ input }) => input);
  if (first === undefined) return Option.none<Attributes>();

  const inputs: [NewEvent, ...NewEvent[]] = [first, ...later];

  yield* store.log.append(
    session,
    taking === "new-turn" ? [yield* TurnStarted.make({}), ...inputs] : inputs,
  );

  return Option.some((later.at(-1) ?? first).attributes);
});

const goIdle = Effect.fn("Loop.goIdle")(function* (store: Store, session: SessionId) {
  const { running } = yield* stateOf(store, session);
  yield* updateState(store, session, (state) => ({ ...state, running: Option.none() }));
  if (Option.isSome(running)) yield* Deferred.done(running.value.done, Exit.void);
});

/** Logs `input` and claims the session when idle, returning true; else `input` waits in the queue. */
const send = Effect.fn("Loop.send")(function* (store: Store, session: SessionId, queued: Queued) {
  if (yield* claim(store, session)) {
    yield* store.log.append(session, [yield* TurnStarted.make({}), queued.input]);

    return true;
  }

  yield* updateState(store, session, (state) => ({ ...state, queue: [...state.queue, queued] }));

  return false;
});

/**
 * Ends the turn, or goes on when inputs wait: an answered turn takes them into the same turn, any
 * other logs its end and starts a new one. The attributes to go on with, or none when idle.
 */
const endTurn = Effect.fn("Loop.endTurn")(function* (
  store: Store,
  session: SessionId,
  outcome: Outcome,
) {
  const hasQueue = (yield* stateOf(store, session)).queue.length > 0;

  if (!hasQueue || outcome !== "answered") {
    yield* store.log.append(session, [yield* TurnEnded.make({ outcome })]);
  }

  if (!hasQueue) yield* goIdle(store, session);

  return yield* take(store, session, outcome === "answered" ? "same-turn" : "new-turn");
});

/** Releases a fold's claim: logs waiting inputs and returns their attributes to start a turn. */
const release = Effect.fn("Loop.release")(function* (store: Store, session: SessionId) {
  const taken = yield* take(store, session, "new-turn");
  if (Option.isNone(taken)) yield* goIdle(store, session);

  return taken;
});

const setStep = (store: Store, session: SessionId, step: Fiber.Fiber<unknown, unknown>) =>
  updateState(store, session, (state) => ({
    ...state,
    running: Option.map(state.running, (running) => ({ ...running, step: Option.some(step) })),
  }));

/** Empties the queue; returns it with the step a cancel interrupts. */
const empty = Effect.fn("Loop.empty")(function* (store: Store, session: SessionId) {
  const { queue, running } = yield* stateOf(store, session);
  if (queue.length > 0) yield* updateState(store, session, (state) => ({ ...state, queue: [] }));

  return {
    inputs: queue.map(({ input }) => input),
    step: Option.flatMap(running, ({ step }) => step),
  };
});

export const makeSessions = Effect.fn("Loop.makeSessions")(function* (log: SessionLog["Service"]) {
  const lock = yield* Semaphore.make(1);

  const store: Store = {
    log,
    states: yield* SubscriptionRef.make<ReadonlyMap<SessionId, SessionState>>(new Map()),
    checked: yield* Ref.make<ReadonlySet<SessionId>>(new Set()),
  };

  const claimWhenIdle = (session: SessionId): Effect.Effect<void, LogError> =>
    Effect.gen(function* () {
      if (yield* lock.withPermit(claim(store, session))) return;

      const { running } = yield* stateOf(store, session);
      if (Option.isSome(running)) yield* Deferred.await(running.value.done);
      yield* claimWhenIdle(session);
    });

  return {
    send: (session: SessionId, input: Input, mode: SendMode) =>
      lock.withPermit(send(store, session, { input, mode })),
    /** Logs the waiting steers; the attributes of the latest. */
    takeSteers: (session: SessionId) => lock.withPermit(take(store, session, "steers")),
    endTurn: (session: SessionId, outcome: Outcome) =>
      lock.withPermit(endTurn(store, session, outcome)),
    /** Waits until nothing runs in the session, then claims it, as a fold does. */
    claimWhenIdle,
    release: (session: SessionId) => lock.withPermit(release(store, session)),
    /** Starts the turn's steps in a fiber a cancel can interrupt. */
    startSteps: <E>(session: SessionId, steps: Effect.Effect<void, E>) =>
      lock.withPermit(
        Effect.tap(Effect.forkChild(steps), (fiber) => setStep(store, session, fiber)),
      ),
    /** Empties the queue; a cancel also interrupts the step, a pull-back leaves it running. */
    empty: (session: SessionId) => lock.withPermit(empty(store, session)),
    /** The session's state now, then each change. */
    state: (session: SessionId) =>
      SubscriptionRef.changes(store.states).pipe(
        Stream.map((all) => all.get(session) ?? idle),
        Stream.changesWith(looksSame),
        Stream.map(viewOf),
      ),
  };
});

export type Sessions = Effect.Success<ReturnType<typeof makeSessions>>;
