/** The messages each model call sends, built from the session log. */
import { Effect, Option } from "effect";

import { Pipeline, Registry } from "@shanepadgett/liminal-core";
import type { Message } from "@shanepadgett/liminal-model/contract";
import type { EventInvalid, EventKind, SessionEvent } from "@shanepadgett/liminal-session/contract";

/** Turns the events of one kind into the messages the model sees. */
export interface Converter {
  readonly kind: string;
  readonly convert: (event: SessionEvent) => Effect.Effect<ReadonlyArray<Message>, EventInvalid>;
}

/** One converter per event kind; of two for one kind, the one added last is used. */
export class Converters extends Registry.Service<Converters, Converter>()("history/Converters") {}

/** The log, through the converters, into model messages; a kind with no converter is left out. */
export class History extends Pipeline.Service<
  History,
  ReadonlyArray<SessionEvent>,
  ReadonlyArray<Message>,
  EventInvalid
>()("history/History") {}

/** A converter for `event`'s kind that reads each event's data with its schema. */
export const defineConverter = <T>(
  event: EventKind<T>,
  convert: (data: T) => ReadonlyArray<Message>,
): Converter => ({
  kind: event.kind,
  convert: (item) =>
    Effect.map(
      event.decode(item),
      Option.match({ onNone: (): ReadonlyArray<Message> => [], onSome: convert }),
    ),
});
