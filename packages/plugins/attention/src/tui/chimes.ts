/** When the session on screen needs the user: the events that call for the sound. */

import { Option, Predicate, Schema, Stream } from "effect";

import type { PendingAsk } from "@liminal/approval/contract";
import type { FollowEvent } from "@liminal/sdk";
import { TurnEndedEntry } from "@liminal/session-log/contract";

const endOf = Schema.decodeUnknownOption(TurnEndedEntry.data);

/** What called for the sound. */
export type Chime = "turn-ended" | "approval";

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

/** Each list of pending asks that holds an ask the list before it did not. */
export const newAsks = <E>(
  lists: Stream.Stream<ReadonlyArray<PendingAsk>, E>,
): Stream.Stream<Chime, E> =>
  lists.pipe(
    Stream.mapAccum(
      (): ReadonlySet<string> => new Set(),
      (before, asks) => {
        const now = new Set(asks.map(({ id }) => id));
        const isNew = asks.some(({ id }) => !before.has(id));

        return [now, isNew ? (["approval"] as const) : []];
      },
    ),
  );
