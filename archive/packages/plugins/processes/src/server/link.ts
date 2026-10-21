/**
 * The server's way to the holder program: a client of the holder that answers on the socket, or a
 * newly started holder when a command needs one. Each use connects in its own scope.
 */

import { join } from "node:path";

import {
  Duration,
  Effect,
  FileSystem,
  Option,
  Schedule,
  Scope,
  Semaphore,
  SubscriptionRef,
} from "effect";

import { Directories } from "@liminal/sdk";

import { HolderUnavailable } from "../contract.ts";
import { socketName } from "./holder/protocol.ts";
import { holderClient } from "./holder/serve.ts";

const HELLO_TIMEOUT = Duration.seconds(1);
const START_TIMEOUT = Duration.seconds(5);
const START_POLL = Duration.millis(100);

/** The holder program's entry, run with the same Bun as the server. */
const HOLDER_MAIN = join(import.meta.dir, "holder", "main.ts");

export type HolderClient = Effect.Success<ReturnType<typeof holderClient>>;

export interface HolderLink {
  /** A client of the holder that answers, or none when no holder runs. */
  readonly connect: Effect.Effect<Option.Option<HolderClient>, never, Scope.Scope>;
  /** A client, starting the holder first when none answers. */
  readonly ensure: Effect.Effect<HolderClient, HolderUnavailable, Scope.Scope>;
  /** Counts the holders this server started, so watchers can connect to a new one. */
  readonly started: SubscriptionRef.SubscriptionRef<number>;
}

const spawnHolder = (path: string) =>
  Effect.try({
    try: () => {
      Bun.spawn([process.execPath, HOLDER_MAIN, path], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      }).unref();
    },
    catch: (cause) => new HolderUnavailable({ reason: String(cause) }),
  });

export const makeHolderLink = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const { temp } = yield* Directories;
  const path = join(temp, socketName);
  const started = yield* SubscriptionRef.make(0);
  const starting = yield* Semaphore.make(1);

  const connect = Effect.gen(function* () {
    const client = yield* holderClient(path);
    yield* client["holder/hello"]().pipe(Effect.timeout(HELLO_TIMEOUT));

    return client;
  }).pipe(Effect.option);

  const connected = connect.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new HolderUnavailable({ reason: "it did not answer in time" })),
        onSome: Effect.succeed,
      }),
    ),
  );

  const launch = Effect.gen(function* () {
    yield* fs
      .makeDirectory(temp, { recursive: true })
      .pipe(Effect.mapError((error) => new HolderUnavailable({ reason: error.message })));

    yield* spawnHolder(path);

    const client = yield* connected.pipe(
      Effect.retry(Schedule.spaced(START_POLL)),
      Effect.timeoutOrElse({
        duration: START_TIMEOUT,
        orElse: () => Effect.fail(new HolderUnavailable({ reason: "it did not start in time" })),
      }),
    );

    yield* SubscriptionRef.update(started, (count) => count + 1);

    return client;
  });

  const ensure = starting.withPermits(1)(
    Effect.flatMap(connect, Option.match({ onNone: () => launch, onSome: Effect.succeed })),
  );

  return { connect, ensure, started } satisfies HolderLink;
});
