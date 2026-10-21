/** Following a session: its saved entries and Synced, then new entries and live slot changes. */

import { Context, Deferred, Effect, Exit, Option, Schema, Scope, Stream } from "effect";

import {
  FeedMissing,
  type FollowEvent,
  LiveEvent,
  SavedEvent,
  type Seq,
  SessionFeed,
  type SessionId,
  type SessionNotFound,
  type StoreError,
  Synced,
} from "@liminal/sdk";

import type { Graph } from "../graph/graphs.ts";

const isSynced = Schema.is(Synced);

/** The live slot starts only once Synced has gone out, so the history always arrives first. */
const follow = (
  feed: SessionFeed["Service"],
  session: SessionId,
  after: Option.Option<Seq>,
): Stream.Stream<FollowEvent, SessionNotFound | StoreError> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const synced = yield* Deferred.make<void>();

      const entries = feed
        .follow(
          session,
          Option.match(after, { onNone: () => ({}), onSome: (seq) => ({ after: seq }) }),
        )
        .pipe(
          Stream.map((item): FollowEvent =>
            isSynced(item) ? item : SavedEvent.make({ entry: item }),
          ),
        );

      const live = Stream.fromEffect(Deferred.await(synced)).pipe(
        Stream.flatMap(() => feed.watchLive(session)),
        Stream.map((slot) =>
          LiveEvent.make(
            Option.match(slot, { onNone: () => ({}), onSome: (state) => ({ live: state }) }),
          ),
        ),
      );

      return Stream.merge(entries, live).pipe(
        Stream.tap((event) => (isSynced(event) ? Deferred.done(synced, Exit.void) : Effect.void)),
      );
    }),
  );

const isSaved = Schema.is(SavedEvent);

/** A graph's SessionFeed and the build that holds it; the build may be shared by later graphs. */
const feedOf = (graph: Graph) => {
  const name = graph.providers.get(SessionFeed.key);
  const build = graph.builds.find((made) => made.manifest.name === name);
  if (build === undefined) return;

  return Option.match(Context.getOption(build.services, SessionFeed), {
    onNone: () => {},
    onSome: (feed) => ({ feed, scope: build.scope }),
  });
};

/** Done once `scope` closes, at once when it already has. */
const closedOf = (scope: Scope.Scope) =>
  Deferred.make<void>().pipe(
    Effect.tap((closed) => Scope.addFinalizer(scope, Deferred.done(closed, Exit.void))),
  );

/**
 * Follows a session across graph changes: every distinct SessionFeed of the graphs current since it
 * started, each until its build closes. A saved entry goes out once, in `Seq` order, and Synced
 * goes out once.
 */
export const followAcross = (
  changes: Stream.Stream<Graph>,
  session: SessionId,
  after: Option.Option<Seq>,
): Stream.Stream<FollowEvent, SessionNotFound | StoreError | FeedMissing> =>
  Stream.suspend(() => {
    const seen = new Set<SessionFeed["Service"]>();
    let last = after;
    let synced = false;
    let first = true;

    const forGraph = (
      graph: Graph,
    ): Stream.Stream<FollowEvent, SessionNotFound | StoreError | FeedMissing> => {
      const found = feedOf(graph);
      const isFirst = first;
      first = false;
      if (found === undefined) return isFirst ? Stream.fail(new FeedMissing()) : Stream.empty;
      if (seen.has(found.feed)) return Stream.empty;
      seen.add(found.feed);

      return Stream.unwrap(
        Effect.map(closedOf(found.scope), (closed) =>
          follow(found.feed, session, last).pipe(Stream.interruptWhen(Deferred.await(closed))),
        ),
      );
    };

    const fresh = (event: FollowEvent) => {
      if (isSaved(event)) {
        const { seq } = event.entry;
        if (Option.isSome(last) && seq <= last.value) return false;
        last = Option.some(seq);

        return true;
      }

      if (!isSynced(event)) return true;
      if (synced) return false;
      synced = true;

      return true;
    };

    return changes.pipe(
      Stream.flatMap(forGraph, { concurrency: "unbounded" }),
      Stream.filter(fresh),
    );
  });
