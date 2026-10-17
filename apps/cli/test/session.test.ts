/**
 * A client of the built-in plugins over the in-memory protocol: it creates a session, follows it,
 * sees what the kernel saves and streams, previews the context and lists the session.
 */

import { expect } from "bun:test";

import { Context, Effect, Path, Predicate, Queue, Stream } from "effect";
import { RpcClient } from "effect/rpc";

import { ContextRpcs } from "@liminal/context/contract";
import { start } from "@liminal/kernel";
import { type FollowEvent, KernelRpcs, SessionId } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";
import { SessionLog, SessionLogRpcs, userMessage } from "@liminal/session-log/contract";

const s1 = SessionId.make("s1");
const model = { provider: "codex", id: "gpt-5.5" };

/** What a followed event says, in one line. */
const describe = (event: FollowEvent) => {
  if (Predicate.isTagged(event, "Synced")) return "synced";
  if (Predicate.isTagged(event, "Saved")) return `saved ${event.entry.seq} ${event.entry.text}`;

  return event.live === undefined ? "live none" : `live ${event.live.kind}`;
};

effectTest(
  "a client follows a session it created and sees saved entries, Synced and the live slot",
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const kernel = yield* start({
      folders: [path.resolve(import.meta.dir, "../../../packages/plugins")],
    });

    const client = yield* RpcClient.make(KernelRpcs.merge(SessionLogRpcs, ContextRpcs)).pipe(
      Effect.provideService(RpcClient.Protocol, yield* kernel.connect),
    );

    // The turn's writer runs in the kernel's process; the client only reads.
    const log = Context.getUnsafe(kernel.services, SessionLog);

    yield* client["session-log/create"]({ session: s1 });

    const seen = yield* Queue.unbounded<string>();

    yield* client["kernel/follow"]({ session: s1 }).pipe(
      Stream.runForEach((event) => Queue.offer(seen, describe(event))),
      Effect.forkChild,
    );

    expect(yield* Queue.take(seen)).toBe("synced");
    expect(yield* Queue.take(seen)).toBe("live none");

    yield* log.append(s1, [userMessage("hello")]);
    expect(yield* Queue.take(seen)).toBe("saved 1 hello");

    yield* log.setLive(s1, { kind: "test/typing", data: "he" });
    expect(yield* Queue.take(seen)).toBe("live test/typing");

    const preview = yield* client["context/preview"]({ session: s1, model });

    const texts = preview.messages.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
    );

    expect(texts).toContain("hello");

    const sessions = yield* client["session-log/list"]();
    expect(sessions.map((session) => [session.id, session.lastSeq])).toEqual([[s1, 1]]);
  }),
  testBaseServices,
);
