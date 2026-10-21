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
  TurnEndingHooks,
} from "@liminal/agent-loop/contract";
import {
  dataFile,
  Directories,
  type Entry,
  type EntryDraft,
  Registry,
  type SessionId,
  type Synced,
} from "@liminal/sdk";
import { SessionLog, TurnEndedEntry, TurnStartedEntry } from "@liminal/session-log/contract";

import {
  Inbox,
  InboxRpcs,
  NoTurnSettings,
  type Queued,
  type SendMode,
  TagSources,
} from "./contract.ts";
import { makeCompose } from "./server/compose.ts";
import { Stashes, stashesLayer } from "./server/stashes.ts";

/** A message waiting for the running turn: its text to show and the draft to append. */
interface Pending {
  readonly text: string;
  readonly draft: EntryDraft;
}

/** A session's waiting messages, oldest first. */
interface Waiting {
  readonly steers: ReadonlyArray<Pending>;
  readonly followUps: ReadonlyArray<Pending>;
}

const empty: Waiting = { steers: [], followUps: [] };

/** Inbox's hooks run after any registered before them. */
const hookOrder = 100;

const isEnded = (event: Entry | Synced) =>
  !Predicate.isTagged(event, "Synced") && event.kind === TurnEndedEntry.kind;

const queuedWith = (waiting: Waiting, pending: Pending, mode: SendMode): Waiting =>
  mode === "steer"
    ? { ...waiting, steers: [...waiting.steers, pending] }
    : { ...waiting, followUps: [...waiting.followUps, pending] };

const textsOf = (waiting: Waiting): Queued => ({
  steers: waiting.steers.map((pending) => pending.text),
  followUps: waiting.followUps.map((pending) => pending.text),
});

const draftsOf = (pending: ReadonlyArray<Pending>) => pending.map((each) => each.draft);

/** Each session's queued input. */
type Queues = SubscriptionRef.SubscriptionRef<ReadonlyMap<SessionId, Waiting>>;

/** Empties the session's queue, returning what it held. */
const take = (queues: Queues, session: SessionId) =>
  SubscriptionRef.modify(queues, (map): [Waiting, ReadonlyMap<SessionId, Waiting>] => [
    map.get(session) ?? empty,
    new Map(map).set(session, empty),
  ]);

const put = (queues: Queues, session: SessionId, pending: Pending, mode: SendMode) =>
  SubscriptionRef.update(queues, (map) =>
    new Map(map).set(session, queuedWith(map.get(session) ?? empty, pending, mode)),
  );

/** Takes the session's steers, leaving its follow-ups queued. */
const takeSteers = (queues: Queues, session: SessionId) =>
  SubscriptionRef.modify(queues, (map): [Waiting, ReadonlyMap<SessionId, Waiting>] => {
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

/**
 * Saves the queued input, then `pending`, as user messages, and starts a turn on them. The first
 * prompt creates the session.
 */
const startTurn = Effect.fn("Inbox.startTurn")(function* (
  state: State,
  session: SessionId,
  pending: Pending,
) {
  const settings = yield* state.loop
    .sessionSettings(session)
    .pipe(Effect.mapError((error) => new NoTurnSettings({ message: error.message })));

  const queued = yield* take(state.queues, session);
  const drafts = Arr.append(draftsOf([...queued.steers, ...queued.followUps]), pending.draft);
  const append = state.log.append(session, drafts);

  yield* append.pipe(
    Effect.catchTag("SessionNotFound", () => Effect.andThen(state.log.create(session), append)),
  );

  yield* state.loop.start(session, settings);
});

const send = Effect.fn("Inbox.send")(function* (
  state: State,
  session: SessionId,
  pending: Pending,
  mode: SendMode,
) {
  if (state.ending.has(session)) {
    yield* awaitEnd(state, session, state.ending.get(session));
    state.ending.delete(session);
  } else if ((yield* marker(state, session))?.kind === TurnStartedEntry.kind) {
    return yield* put(state.queues, session, pending, mode);
  }

  return yield* startTurn(state, session, pending);
});

const beforeCall = (state: State, turn: Turn) =>
  Effect.map(takeSteers(state.queues, turn.sessionId), (queued) =>
    BeforeCall.Proceed({ input: draftsOf(queued.steers) }),
  );

/** Steers left after the last call join the follow-ups; with none, the turn is ending. */
const turnEnding = Effect.fn("Inbox.turnEnding")(function* (state: State, turn: Turn) {
  const queued = yield* take(state.queues, turn.sessionId);
  const pending = [...queued.steers, ...queued.followUps];

  if (pending.length === 0)
    state.ending.set(turn.sessionId, yield* Effect.orDie(marker(state, turn.sessionId)));

  return draftsOf(pending);
});

const make = Effect.gen(function* () {
  const sources = yield* TagSources;
  const compose = yield* makeCompose(sources.list, yield* dataFile("pictures"));

  const state: State = {
    log: yield* SessionLog,
    loop: yield* AgentLoop,
    queues: yield* SubscriptionRef.make<ReadonlyMap<SessionId, Waiting>>(new Map()),
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
    send: (session, input, mode) =>
      compose(input).pipe(
        Effect.flatMap((draft) =>
          lock.withPermit(send(state, session, { text: input.text, draft }, mode)),
        ),
      ),
    sendDraft: (session, message, mode) => lock.withPermit(send(state, session, message, mode)),
    queue: (session) =>
      SubscriptionRef.changes(state.queues).pipe(
        Stream.map((map) => map.get(session) ?? empty),
        Stream.changesWith((a, b) => a === b),
        Stream.map(textsOf),
      ),
  });
});

/** Every source's rows for `query`, in the sources' order. */
const findTags = (sources: TagSources["Service"], query: string) =>
  Effect.flatMap(sources.list, (list) =>
    Effect.map(
      Effect.forEach(list, (source) => source.find(query), { concurrency: "unbounded" }),
      (found) => found.flat(),
    ),
  );

const rpcs = InboxRpcs.toLayer(
  Effect.gen(function* () {
    const inbox = yield* Inbox;
    const sources = yield* TagSources;
    const stashes = yield* Stashes;
    const folder = (yield* Directories).workspace;

    return InboxRpcs.of({
      "inbox/send": ({ session, input, mode }) => inbox.send(session, input, mode),
      "inbox/queue": ({ session }) => inbox.queue(session),
      "inbox/tags": ({ query }) => findTags(sources, query),
      "inbox/stash": ({ text }) => stashes.add(folder, text),
      "inbox/stashes": () => stashes.list(folder),
      "inbox/unstash": ({ id }) => stashes.remove(id),
    });
  }),
);

const stashes = Layer.unwrap(Effect.map(dataFile("stashes.db"), stashesLayer));

export const layer = rpcs.pipe(
  Layer.provideMerge(Layer.effect(Inbox, make)),
  Layer.provide(stashes),
  Layer.provideMerge(Registry.layer(TagSources)),
);
