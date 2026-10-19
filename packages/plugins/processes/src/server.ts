/**
 * Processes' server: the `process_*` tools, the hooks that tell the model about commands, and the
 * streams the TUI draws commands from. Commands live in the holder program, so they outlive this
 * server.
 */

import { Effect, Layer, Option, Stream, SubscriptionRef } from "effect";

import { BeforeCallHooks, TurnEndingHooks } from "@liminal/agent-loop/contract";
import { EntryKinds } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tools/contract";

import { NoticeEntry, type ProcessSummary, ProcessesRpcs } from "./contract.ts";
import { makeHooks } from "./server/hooks.ts";
import { type HolderClient, type HolderLink, makeHolderLink } from "./server/link.ts";
import { makeTools } from "./server/tools.ts";

/** Hooks run after compaction's and before checks settle the turn. */
const HOOK_ORDER = 40;

const register = Effect.fn("processes.register")(function* (link: HolderLink) {
  const tools = yield* Tools;
  yield* (yield* EntryKinds).register(NoticeEntry);
  yield* Effect.forEach(yield* makeTools(link), (tool) => tools.register(tool), { discard: true });

  const { beforeCall, turnEnding } = yield* makeHooks(link);
  yield* (yield* BeforeCallHooks).register(beforeCall, { order: HOOK_ORDER });
  yield* (yield* TurnEndingHooks).register(turnEnding, { order: HOOK_ORDER });
});

/** `use`'s stream from the holder that answers now; `none` when none does or it goes away. */
const fromHolder = <A>(
  link: HolderLink,
  none: Stream.Stream<A>,
  use: (client: HolderClient) => Stream.Stream<A, Error>,
) =>
  Stream.unwrap(
    Effect.map(
      link.connect,
      Option.match({
        onNone: () => none,
        onSome: (client) => use(client).pipe(Stream.catch(() => none)),
      }),
    ),
  );

const rpcsOf = (link: HolderLink) =>
  ProcessesRpcs.of({
    "processes/list": ({ session }) =>
      SubscriptionRef.changes(link.started).pipe(
        Stream.switchMap(() =>
          fromHolder(link, Stream.succeed<ReadonlyArray<ProcessSummary>>([]), (client) =>
            client["holder/watch"]({ session }),
          ),
        ),
      ),
    "processes/output": ({ session, id }) =>
      fromHolder(link, Stream.empty, (client) => client["holder/output"]({ session, id })),
  });

export const layer = Layer.unwrap(
  Effect.map(makeHolderLink, (link) =>
    Layer.mergeAll(
      Layer.effectDiscard(register(link)),
      ProcessesRpcs.toLayer(Effect.succeed(rpcsOf(link))),
    ),
  ),
);
