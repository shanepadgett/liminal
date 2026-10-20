/** When the session on screen needs the user: the events that call for the sound. */

import { type Effect, Option, Predicate, Schema, Stream } from "effect";

import type { FollowEvent, SessionId } from "@liminal/sdk";
import type { InputWait } from "@liminal/sdk/tui";
import { TurnEndedEntry } from "@liminal/session-log/contract";

const endOf = Schema.decodeUnknownOption(TurnEndedEntry.data);

/** What called for the sound. */
export type Chime = "turn-ended" | "input-wait";

/** Each turn that ends after the saved entries, unless the user cancelled it. */
export const turnEnds = <E>(events: Stream.Stream<FollowEvent, E>): Stream.Stream<Chime, E> =>
  events.pipe(
    Stream.dropUntil(Predicate.isTagged("Synced")),
    Stream.filter(
      (event) =>
        Predicate.isTagged(event, "Saved")
        && event.entry.kind === TurnEndedEntry.kind
        && Option.exists(endOf(event.entry.data), ({ end }) => end !== "cancelled"),
    ),
    Stream.as<Chime>("turn-ended"),
  );

/** Delivery is injected so session events do not depend on terminal or audio devices. */
export const chimeWith = <E>(
  session: SessionId,
  events: Stream.Stream<FollowEvent, E>,
  waits: Stream.Stream<ReadonlyArray<InputWait>>,
  notify: (chime: Chime) => Effect.Effect<void>,
): Stream.Stream<Chime, E> =>
  Stream.merge(turnEnds(events), newWaits(session, waits)).pipe(Stream.tap(notify));

/** Only new identities for the session on screen call for attention. */
export const newWaits = <E>(
  session: SessionId,
  lists: Stream.Stream<ReadonlyArray<InputWait>, E>,
): Stream.Stream<Chime, E> =>
  lists.pipe(
    Stream.mapAccum(
      (): ReadonlySet<string> => new Set(),
      (before, waits) => {
        const now = new Set(
          waits.flatMap(({ sessionId, source, id }) =>
            sessionId === session ? [JSON.stringify([source, id])] : [],
          ),
        );

        const isNew = [...now].some((id) => !before.has(id));

        // The literal is the input-wait member of Chime.
        return [now, isNew ? (["input-wait"] as const) : []];
      },
    ),
  );
