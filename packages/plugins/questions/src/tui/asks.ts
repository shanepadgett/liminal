/**
 * The asks a session holds: `AskViews` draws each kind in the composer's place, and the asks the
 * running turn still waits on.
 */
import type { JSX } from "@opentui/solid";
import { Option, Schema } from "effect";

import type { SessionView } from "@shanepadgett/liminal-client";
import { Registry } from "@shanepadgett/liminal-core";
import { TurnStarted } from "@shanepadgett/liminal-loop/contract";
import type { EventKind, SessionEvent, SessionId } from "@shanepadgett/liminal-session/contract";

import { Answered, Asked } from "../contract.ts";

export type AskedData = typeof Asked.schema.Type;

export interface AskProps {
  readonly ask: AskedData;
  readonly session: SessionId;
  /** How many more asks wait after this one. */
  readonly more: number;
  /** Sends the answer, as JSON its kind decodes. */
  readonly answer: (answer: Schema.Json) => void;
  /** Cancels the turn, which closes every ask in it. */
  readonly cancel: () => void;
}

/** How asks of `kind` show while they wait. */
export interface AskView {
  readonly kind: string;
  readonly component: (props: AskProps) => JSX.Element;
}

/** Read when the cover first draws, so add to it from a `tui` entry. */
export class AskViews extends Registry.Service<AskViews, AskView>()("questions/AskViews") {}

export const decodedAs = <T>(kind: EventKind<T>, event: SessionEvent): Option.Option<T> =>
  event.kind === kind.kind ? Schema.decodeOption(kind.schema)(event.data) : Option.none();

/** The asks since the running turn started that have no answer yet, oldest first. */
export const openAsks = (state: SessionView.ViewState): ReadonlyArray<AskedData> => {
  if (!state.running) return [];

  const start = state.events.findLastIndex((event) => event.kind === TurnStarted.kind);
  const since = state.events.slice(start + 1);

  const answered = new Set(
    since.flatMap((event) =>
      Option.toArray(Option.map(decodedAs(Answered, event), ({ id }) => id)),
    ),
  );

  return since.flatMap((event) =>
    decodedAs(Asked, event).pipe(
      Option.filter((ask) => !answered.has(ask.id)),
      Option.toArray,
    ),
  );
};
