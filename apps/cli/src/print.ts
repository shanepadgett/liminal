/**
 * Print mode: sends one prompt to a session, follows the session until the turn that answers it
 * ends, and prints the turn's last reply. A turn that ends any other way prints its notices and the
 * way it ended on stderr instead.
 */

import { Console, Effect, Filter, Option, Schema, type Scope, Stream } from "effect";
import { RpcClient } from "effect/rpc";

import { InboxRpcs } from "@liminal/inbox/contract";
import { NoticeEntry } from "@liminal/notices/contract";
import { type FollowEvent, KernelRpcs, type SavedEntry, type SessionId } from "@liminal/sdk";
import {
  TextEntry,
  ToolResultEntry,
  TurnEndedEntry,
  UserEntry,
} from "@liminal/session-log/contract";

export interface PrintRequest {
  readonly session: SessionId;
  readonly prompt: string;
}

/** What the turn left: its last reply's text, its notices, and how it ended. */
export interface TurnOutput {
  readonly reply: ReadonlyArray<string>;
  readonly notices: ReadonlyArray<string>;
  readonly end: string;
}

const decodeEnd = Schema.decodeUnknownOption(TurnEndedEntry.data);

/** Adds `entry` to the output: tool results start the reply over, so only the last one stays. */
const add = (output: TurnOutput, entry: SavedEntry): TurnOutput => {
  if (entry.kind === TextEntry.kind) return { ...output, reply: [...output.reply, entry.text] };
  if (entry.kind === ToolResultEntry.kind) return { ...output, reply: [] };

  if (entry.kind === NoticeEntry.kind)
    return { ...output, notices: [...output.notices, entry.text] };

  if (entry.kind === TurnEndedEntry.kind) {
    return {
      ...output,
      end: Option.match(decodeEnd(entry.data), {
        onNone: () => "unknown",
        onSome: (data) => data.end,
      }),
    };
  }

  return output;
};

const isPrompt = (prompt: string) => (entry: SavedEntry) =>
  entry.kind === UserEntry.kind && entry.text === prompt;

/**
 * Runs the prompt and returns what its turn left. Following starts after what the session held
 * before the send, and skips anything before the prompt, so a turn already running on the session
 * is not mistaken for this one.
 */
export const runTurn = Effect.fn("runTurn")(function* (
  connect: Effect.Effect<RpcClient.Protocol["Service"], never, Scope.Scope>,
  request: PrintRequest,
) {
  const protocol = yield* connect;

  const kernel = yield* Effect.provideService(
    RpcClient.make(KernelRpcs),
    RpcClient.Protocol,
    protocol,
  );

  const inbox = yield* Effect.provideService(
    RpcClient.make(InboxRpcs),
    RpcClient.Protocol,
    protocol,
  );

  const { session, prompt } = request;

  const synced = yield* kernel["kernel/follow"]({ session }).pipe(
    Stream.filterMap(Filter.tagged<FollowEvent>()("Synced")),
    Stream.runHead,
  );

  const after = Option.flatMap(synced, (event) => Option.fromUndefinedOr(event.seq));
  yield* inbox["inbox/send"]({ session, input: { text: prompt, pictures: [] }, mode: "follow-up" });

  const followed = Option.match(after, {
    onNone: () => kernel["kernel/follow"]({ session }),
    onSome: (seq) => kernel["kernel/follow"]({ session, after: seq }),
  });

  return yield* followed.pipe(
    Stream.filterMap(Filter.tagged<FollowEvent>()("Saved")),
    Stream.map((event) => event.entry),
    Stream.dropWhile((entry) => !isPrompt(prompt)(entry)),
    Stream.takeUntil((entry) => entry.kind === TurnEndedEntry.kind),
    Stream.runFold((): TurnOutput => ({ reply: [], notices: [], end: "unknown" }), add),
  );
});

/** Runs the prompt and prints its turn; returns 0 once the turn answered, 1 otherwise. */
export const printTurn = Effect.fn("printTurn")(function* (
  connect: Effect.Effect<RpcClient.Protocol["Service"], never, Scope.Scope>,
  request: PrintRequest,
) {
  const output = yield* runTurn(connect, request);

  if (output.end === "answered") {
    yield* Console.log(output.reply.join("\n\n"));

    return 0;
  }

  yield* Effect.forEach(output.notices, (text) => Console.error(text), { discard: true });
  yield* Console.error(`The turn ended: ${output.end}`);

  return 1;
});
