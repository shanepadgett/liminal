/** Closing a turn a crash left unfinished, and the results that stand in for calls that never ran. */
import { Array as Arr, Effect } from "effect";
import type { NonEmptyReadonlyArray } from "effect/Array";

import type { Attributes } from "@shanepadgett/liminal-core";
import type { Message, ToolCall, ToolResult } from "@shanepadgett/liminal-model/contract";
import {
  MessageEvent,
  type NewEvent,
  type SessionEvent,
  type SessionId,
  type SessionLog,
} from "@shanepadgett/liminal-session/contract";

import { StepEnded, StepStarted, TurnEnded, TurnStarted } from "./contract.ts";

/** A failed result for `call`; the model reads `reason`. */
export const standIn = (call: ToolCall, reason: string): ToolResult => ({
  type: "tool-result",
  callId: call.id,
  name: call.name,
  result: reason,
  isFailure: true,
});

export const cancelledResult = (call: ToolCall) => standIn(call, "The user cancelled the call.");

/** Each result as its own tool message. */
export const resultEvents = (results: ReadonlyArray<ToolResult>, attributes: Attributes) =>
  Effect.forEach(results, (result) =>
    MessageEvent.make({ role: "tool", parts: [result] }, attributes),
  );

/** The events after the last turn end. */
const sinceLastTurn = (events: ReadonlyArray<SessionEvent>) =>
  events.slice(events.findLastIndex(({ kind }) => kind === TurnEnded.kind) + 1);

const hasKind = (events: ReadonlyArray<SessionEvent>, kind: string) =>
  events.some((event) => event.kind === kind);

/** A step started after the last step end. */
const hasOpenStep = (events: ReadonlyArray<SessionEvent>) =>
  events.findLastIndex(({ kind }) => kind === StepStarted.kind)
  > events.findLastIndex(({ kind }) => kind === StepEnded.kind);

/** The messages among `events`, in order. */
const messagesOf = (events: ReadonlyArray<SessionEvent>) =>
  Effect.map(Effect.forEach(events, MessageEvent.decode), Arr.getSomes);

/** The tool calls among the messages that have no result. */
const unanswered = (messages: ReadonlyArray<Message>) => {
  const parts = messages.flatMap(({ parts: each }) => each);

  const answered = new Set(
    parts.flatMap((part) => (part.type === "tool-result" ? [part.callId] : [])),
  );

  return parts.flatMap((part) =>
    part.type === "tool-call" && !answered.has(part.id) ? [part] : [],
  );
};

/**
 * Logs what ends a turn a crash left unfinished: interrupted results for its calls, the end of an
 * open step and the turn's end. A session whose last turn ended is left alone.
 */
export const closeUnfinished = Effect.fn("Loop.closeUnfinished")(function* (
  log: SessionLog["Service"],
  session: SessionId,
) {
  const events = sinceLastTurn(yield* log.read(session));
  if (!hasKind(events, TurnStarted.kind)) return;

  const results = unanswered(yield* messagesOf(events)).map((call) =>
    standIn(call, "The call was interrupted when Liminal stopped."),
  );

  const stepEnd = hasOpenStep(events) ? [yield* StepEnded.make({ outcome: "interrupted" })] : [];

  const closing: NonEmptyReadonlyArray<NewEvent> = [
    yield* TurnEnded.make({ outcome: "interrupted" }),
  ];

  const resultsAndStep = [...(yield* resultEvents(results, {})), ...stepEnd];
  yield* log.append(session, Arr.appendAll(resultsAndStep, closing));
});

/** Logs a cancelled result for each of the running turn's calls that has none. */
export const cancelUnanswered = Effect.fn("Loop.cancelUnanswered")(function* (
  log: SessionLog["Service"],
  session: SessionId,
  attributes: Attributes,
) {
  const messages = yield* messagesOf(sinceLastTurn(yield* log.read(session)));
  const results = unanswered(messages).map(cancelledResult);
  const [first, ...rest] = yield* resultEvents(results, attributes);

  if (first !== undefined) yield* log.append(session, [first, ...rest]);
});
