/** Following a session: its saved entries and Synced, then new entries and live slot changes. */

import { Deferred, Effect, Exit, Option, Schema, Stream } from "effect";

import {
  type FollowEvent,
  LiveEvent,
  SavedEvent,
  type Seq,
  type SessionFeed,
  type SessionId,
  type SessionNotFound,
  type StoreError,
  Synced,
} from "@liminal/sdk";

const isSynced = Schema.is(Synced);

/** The live slot starts only once Synced has gone out, so the history always arrives first. */
export const follow = (
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
