/** Print mode: one prompt in a new session; the final reply on stdout, notices on stderr. */
import { Console, Effect, Option, Stream } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { LoopRpc, TurnEnded } from "@shanepadgett/liminal-loop/contract";
import {
  type LiveItem,
  MessageEvent,
  Notice,
  SessionRpc,
} from "@shanepadgett/liminal-session/contract";

/** What the turn left so far: its latest reply's text and how it ended. */
interface TurnOutput {
  readonly reply: string;
  readonly outcome: Option.Option<typeof TurnEnded.schema.Type.outcome>;
}

const noOutput: TurnOutput = { reply: "", outcome: Option.none() };

/** Adds `item` to the output; a notice goes to stderr as it arrives. */
const follow = Effect.fn("Print.follow")(function* (output: TurnOutput, item: LiveItem) {
  const notice = yield* Notice.decode(item);
  if (Option.isSome(notice)) yield* Console.error(notice.value.text);

  const ended = yield* TurnEnded.decode(item);
  if (Option.isSome(ended)) return { ...output, outcome: Option.some(ended.value.outcome) };

  const message = yield* MessageEvent.decode(item);
  if (Option.isNone(message) || message.value.role !== "assistant") return output;

  const texts = message.value.parts.flatMap((part) => (part.type === "text" ? [part.text] : []));

  return { ...output, reply: texts.join("") };
});

export const print = Effect.fn("print")(function* (prompt: string) {
  const host = yield* Host;
  const sessions = yield* host.client(SessionRpc);
  const loop = yield* host.client(LoopRpc);
  const session = yield* sessions["session/open"]();
  const input = yield* MessageEvent.make({ role: "user", parts: [{ type: "text", text: prompt }] });
  yield* loop["loop/send"]({ session, input });

  const { reply, outcome } = yield* sessions["session/live"]({ session }).pipe(
    Stream.takeUntil((item) => item.kind === TurnEnded.kind),
    Stream.runFoldEffect(() => noOutput, follow),
  );

  const ending = Option.getOrElse(outcome, () => "unknown");

  if (ending !== "answered") return yield* Console.error(`The turn ended: ${ending}.`);

  return yield* Console.log(reply);
});
