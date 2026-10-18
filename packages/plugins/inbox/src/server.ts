/**
 * Inbox's server: starts a turn on input when none runs; otherwise queues it for agent-loop's
 * before-call hook (steers) or turn-ending hook (follow-ups).
 */

import { Array as Arr, Effect, Layer, Predicate, Semaphore, Stream, SubscriptionRef } from "effect";

import {
  AgentLoop,
  BeforeCall,
  BeforeCallHooks,
  type Turn,
  TurnEndedEntry,
  TurnEndingHooks,
  TurnStartedEntry,
} from "@liminal/agent-loop/contract";
import type { Entry, SessionId, Synced } from "@liminal/sdk";
import { SessionLog, userMessage } from "@liminal/session-log/contract";

import { Inbox, InboxRpcs, NoTurnSettings, type Queued, type SendMode } from "./contract.ts";

const empty: Queued = { steers: [], followUps: [] };

/** Inbox's hooks run after any registered before them. */
const hookOrder = 100;

const isEnded = (event: Entry | Synced) =>
  !Predicate.isTagged(event, "Synced") && event.kind === TurnEndedEntry.kind;

const queuedWith = (queued: Queued, text: string, mode: SendMode): Queued =>
  mode === "steer"
    ? { ...queued, steers: [...queued.steers, text] }
    : { ...queued, followUps: [...queued.followUps, text] };

/** Each session's queued input. */
type Queues = SubscriptionRef.SubscriptionRef<ReadonlyMap<SessionId, Queued>>;

/** Empties the session's queue, returning what it held. */
const take = (queues: Queues, session: SessionId) =>
  SubscriptionRef.modify(queues, (map): [Queued, ReadonlyMap<SessionId, Queued>] => [
    map.get(session) ?? empty,
    new Map(map).set(session, empty),
  ]);

const put = (queues: Queues, session: SessionId, text: string, mode: SendMode) =>
  SubscriptionRef.update(queues, (map) =>
    new Map(map).set(session, queuedWith(map.get(session) ?? empty, text, mode)),
  );

/** Takes the session's steers, leaving its follow-ups queued. */
const takeSteers = (queues: Queues, session: SessionId) =>
  SubscriptionRef.modify(queues, (map): [Queued, ReadonlyMap<SessionId, Queued>] => {
    const queued = map.get(session) ?? empty;

    return [queued, new Map(map).set(session, { ...queued, steers: [] })];
  });

/** What sending and the hooks share. */
interface State {
  readonly log: SessionLog["Service"];
  readonly loop: AgentLoop["Service"];
  readonly queues: Queues;
  /**
   * Sessions whose turn-ending hook found nothing queued, so their turn is ending, with the turn
   * marker newest then; the next input waits for that turn's end entry before starting a turn.
   */
  readonly ending: Map<SessionId, Entry | undefined>;
}

/** The session's newest turn marker, if any. */
const marker = (state: State, session: SessionId) =>
  Effect.map(state.log.lastOfKinds([TurnStartedEntry, TurnEndedEntry]), (entries) =>
    entries.find((entry) => entry.sessionId === session),
  );

const awaitEnd = (state: State, session: SessionId, seen: Entry | undefined) =>
  state.log
    .subscribe(session, seen === undefined ? {} : { after: seen.seq })
    .pipe(Stream.filter(isEnded), Stream.runHead);

/** Saves the queued input, then `text`, as user messages, and starts a turn on them. */
const startTurn = Effect.fn("Inbox.startTurn")(function* (
  state: State,
  session: SessionId,
  text: string,
) {
  const settings = yield* state.loop.defaults.pipe(
    Effect.mapError((error) => new NoTurnSettings({ message: error.message })),
  );

  const queued = yield* take(state.queues, session);
  const earlier = [...queued.steers, ...queued.followUps].map(userMessage);
  yield* state.log.append(session, Arr.append(earlier, userMessage(text)));
  yield* state.loop.start(session, settings);
});

const send = Effect.fn("Inbox.send")(function* (
  state: State,
  session: SessionId,
  text: string,
  mode: SendMode,
) {
  if (state.ending.has(session)) {
    yield* awaitEnd(state, session, state.ending.get(session));
    state.ending.delete(session);
  } else if ((yield* marker(state, session))?.kind === TurnStartedEntry.kind) {
    return yield* put(state.queues, session, text, mode);
  }

  return yield* startTurn(state, session, text);
});

const beforeCall = (state: State, turn: Turn) =>
  Effect.map(takeSteers(state.queues, turn.sessionId), (queued) =>
    BeforeCall.Proceed({ input: queued.steers.map(userMessage) }),
  );

/** Steers left after the last call join the follow-ups; with none, the turn is ending. */
const turnEnding = Effect.fn("Inbox.turnEnding")(function* (state: State, turn: Turn) {
  const queued = yield* take(state.queues, turn.sessionId);
  const texts = [...queued.steers, ...queued.followUps];

  if (texts.length === 0)
    state.ending.set(turn.sessionId, yield* Effect.orDie(marker(state, turn.sessionId)));

  return texts.map(userMessage);
});

const make = Effect.gen(function* () {
  const state: State = {
    log: yield* SessionLog,
    loop: yield* AgentLoop,
    queues: yield* SubscriptionRef.make<ReadonlyMap<SessionId, Queued>>(new Map()),
    ending: new Map(),
  };

  /** Sending and both hooks take turns, so input never lands between a hook's read and its answer. */
  const lock = yield* Semaphore.make(1);

  yield* (yield* BeforeCallHooks).register((turn) => lock.withPermit(beforeCall(state, turn)), {
    order: hookOrder,
  });

  yield* (yield* TurnEndingHooks).register((turn) => lock.withPermit(turnEnding(state, turn)), {
    order: hookOrder,
  });

  return Inbox.of({
    send: (session, text, mode) => lock.withPermit(send(state, session, text, mode)),
    queue: (session) =>
      SubscriptionRef.changes(state.queues).pipe(
        Stream.map((map) => map.get(session) ?? empty),
        Stream.changesWith((a, b) => a === b),
      ),
  });
});

const rpcs = InboxRpcs.toLayer(
  Effect.gen(function* () {
    const inbox = yield* Inbox;

    return InboxRpcs.of({
      "inbox/send": ({ session, text, mode }) => inbox.send(session, text, mode),
      "inbox/queue": ({ session }) => inbox.queue(session),
    });
  }),
);

export const layer = rpcs.pipe(Layer.provideMerge(Layer.effect(Inbox, make)));
