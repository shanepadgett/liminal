/**
 * Print mode: one prompt in a new session. Text mode writes the final reply on stdout and notices
 * on stderr; JSON mode writes each saved event and delta as a JSON line.
 */
import { Console, Duration, Effect, Option, Schema, Stream } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { LoopRpc, TurnEnded } from "@shanepadgett/liminal-loop/contract";
import {
  LiveItem,
  MessageEvent,
  Notice,
  type SessionId,
  SessionRpc,
} from "@shanepadgett/liminal-session/contract";

import { ExitCode, failed } from "./exit-code.ts";

type Outcome = typeof TurnEnded.schema.Type.outcome;

/** What the turn left so far: its latest reply's text and how it ended. */
interface TurnOutput {
  readonly reply: string;
  readonly outcome: Option.Option<Outcome>;
}

const noOutput: TurnOutput = { reply: "", outcome: Option.none() };

/** How long Ctrl-C waits for the cancelled turn to log its end. */
const cancelWait = Duration.seconds(2);

const isTurnEnd = (item: LiveItem) => item.kind === TurnEnded.kind;

/** Notes the outcome when `item` ends the turn. */
const ending = (output: TurnOutput, item: LiveItem) =>
  Effect.map(TurnEnded.decode(item), (ended) =>
    Option.match(ended, {
      onNone: () => output,
      onSome: ({ outcome }) => ({ ...output, outcome: Option.some(outcome) }),
    }),
  );

/** Keeps the latest assistant text; a notice goes to stderr as it arrives. */
const followText = Effect.fn("Print.followText")(function* (output: TurnOutput, item: LiveItem) {
  const notice = yield* Notice.decode(item);
  if (Option.isSome(notice)) yield* Console.error(notice.value.text);

  const message = yield* MessageEvent.decode(item);
  const next = yield* ending(output, item);
  if (Option.isNone(message) || message.value.role !== "assistant") return next;

  const texts = message.value.parts.flatMap((part) => (part.type === "text" ? [part.text] : []));

  return { ...next, reply: texts.join("") };
});

const encodeLine = Schema.encodeEffect(Schema.fromJsonString(Schema.toCodecJson(LiveItem)));

/** Writes `item` as one JSON line. */
const followJson = (output: TurnOutput, item: LiveItem) =>
  encodeLine(item).pipe(
    Effect.orDie,
    Effect.flatMap(Console.log),
    Effect.andThen(ending(output, item)),
  );

export const print = Effect.fn("print")(function* (prompt: string, json: boolean) {
  const host = yield* Host;
  const sessions = yield* host.client(SessionRpc);
  const loop = yield* host.client(LoopRpc);
  const session = yield* sessions["session/open"]();
  const input = yield* MessageEvent.make({ role: "user", parts: [{ type: "text", text: prompt }] });

  const live = (id: SessionId) =>
    sessions["session/live"]({ session: id }).pipe(Stream.takeUntil(isTurnEnd));

  /** Ctrl-C cancels the turn and waits briefly for it to log its end. */
  const cancel = loop["loop/cancel"]({ session }).pipe(
    Effect.andThen(Stream.runDrain(live(session))),
    Effect.timeout(cancelWait),
    Effect.ignore,
  );

  yield* loop["loop/send"]({ session, input });

  const { reply, outcome } = yield* live(session).pipe(
    Stream.runFoldEffect(() => noOutput, json ? followJson : followText),
    Effect.onInterrupt(() => cancel),
  );

  const ended = Option.getOrElse(outcome, (): Outcome | "unknown" => "unknown");
  if (ended === "answered") return yield* json ? Effect.void : Console.log(reply);
  // A failed turn already logged a notice saying why.
  if (!json && ended !== "failed") yield* Console.error(`The turn ended: ${ended}.`);

  return yield* new ExitCode({ code: failed });
});
