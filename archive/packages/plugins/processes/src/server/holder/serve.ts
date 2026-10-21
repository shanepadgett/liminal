/**
 * The holder program's work: serves {@link HolderRpcs} on a Unix socket and returns once no command
 * has run and no server has been connected for `idle`.
 */

import * as BunSocket from "@effect/platform-bun/BunSocket";
import * as BunSocketServer from "@effect/platform-bun/BunSocketServer";
import { Duration, Effect, FileSystem, Option, Ref, Schedule, Schema, Stream } from "effect";
import { RpcClient, RpcSerialization, RpcServer } from "effect/rpc";
import { Socket, SocketServer } from "effect/socket";

import { BadPattern } from "../../contract.ts";
import {
  type Commands,
  exitOf,
  makeCommands,
  readLive,
  tailOf,
  waitFor,
  writeLive,
} from "./commands.ts";
import { HolderRpcs } from "./protocol.ts";

const CHECK = Duration.seconds(1);
const HELLO_TIMEOUT = Duration.seconds(1);

/** Another holder already answers on the socket. */
export class AlreadyServing extends Schema.TaggedError<
  AlreadyServing,
  { readonly brand: unique symbol }
>()("AlreadyServing", {}) {}

const neverRetry = Schedule.recurs(0);

/** A client of the holder at `path`, in the current scope; it does not reconnect. */
export const holderClient = (path: string) =>
  Effect.gen(function* () {
    const protocol = yield* RpcClient.makeProtocolSocket({ retryPolicy: neverRetry }).pipe(
      Effect.provideServiceEffect(Socket.Socket, BunSocket.makeNet({ path })),
      Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
    );

    return yield* RpcClient.make(HolderRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, protocol),
    );
  });

/** Whether a holder answers at `path`. */
const answers = (path: string) =>
  Effect.gen(function* () {
    const client = yield* holderClient(path);
    yield* client["holder/hello"]();
  }).pipe(
    Effect.scoped,
    Effect.timeout(HELLO_TIMEOUT),
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );

/** Fails when a holder answers at `path`; removes a socket file nobody answers on. */
const claim = Effect.fn("processes.claim")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(path))) return yield* Effect.void;
  if (yield* answers(path)) return yield* new AlreadyServing();

  return yield* fs.remove(path);
});

const compile = (pattern: string | undefined) =>
  pattern === undefined
    ? Effect.succeed(Option.none<RegExp>())
    : Effect.try({
        try: () => Option.some(new RegExp(pattern)),
        catch: () => new BadPattern({ pattern }),
      });

const handlersOf = (commands: Commands) =>
  HolderRpcs.of({
    "holder/hello": () => Effect.void,
    "holder/start": (request) => commands.start(request),
    "holder/list": ({ session }) => commands.list(session),
    "holder/watch": ({ session }) =>
      Stream.fromPubSub(commands.states).pipe(
        Stream.filter((changed) => changed === session),
        Stream.merge(Stream.make(session)),
        Stream.mapEffect(() => commands.list(session)),
      ),
    "holder/read": ({ session, id }) => Effect.flatMap(commands.find(session, id), readLive),
    "holder/write": ({ session, id, text }) =>
      Effect.flatMap(commands.find(session, id), (live) => writeLive(live, text)),
    "holder/wait": ({ session, id, pattern, quietSeconds, deadlineSeconds }) =>
      Effect.gen(function* () {
        const live = yield* commands.find(session, id);

        return yield* waitFor(live, {
          pattern: yield* compile(pattern),
          quiet: Duration.seconds(quietSeconds),
          deadline: Duration.seconds(deadlineSeconds),
        });
      }),
    "holder/stop": ({ session, id }) =>
      Effect.flatMap(commands.find(session, id), (live) => commands.stop(session, live)),
    "holder/exits": ({ session }) =>
      Effect.flatMap(commands.lives(session), Effect.forEach(exitOf)).pipe(
        Effect.map((each) => each.flat()),
      ),
    "holder/output": ({ session, id }) =>
      Stream.unwrap(Effect.map(commands.find(session, id), tailOf)),
  });

/** The socket server, counting the clients connected. */
const countedServer = Effect.fn("processes.countedServer")(function* (
  path: string,
  connections: Ref.Ref<number>,
) {
  const server = yield* BunSocketServer.make({ path });

  return SocketServer.SocketServer.of({
    address: server.address,
    run: (handler) =>
      server.run((socket) =>
        Effect.acquireUseRelease(
          Ref.update(connections, (count) => count + 1),
          () => handler(socket),
          () => Ref.update(connections, (count) => count - 1),
        ),
      ),
  });
});

/** Serves at `path` until idle for `idle`, then stops every command left and returns. */
export const serveHolder = Effect.fn("processes.serveHolder")(function* (
  path: string,
  idle: Duration.Duration,
) {
  yield* claim(path);
  const commands = yield* makeCommands;
  const connections = yield* Ref.make(0);
  const server = yield* countedServer(path, connections);

  const protocol = yield* RpcServer.makeProtocolSocketServer.pipe(
    Effect.provideService(SocketServer.SocketServer, server),
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
  );

  const handlers = yield* HolderRpcs.toHandlers(Effect.succeed(handlersOf(commands)));

  yield* RpcServer.make(HolderRpcs, { disableFatalDefects: true }).pipe(
    Effect.provideContext(handlers),
    Effect.provideService(RpcServer.Protocol, protocol),
    Effect.forkScoped,
  );

  let quiet = Duration.zero;

  while (Duration.isLessThan(quiet, idle)) {
    yield* Effect.sleep(CHECK);
    const busy = (yield* Ref.get(connections)) > 0 || (yield* commands.running) > 0;
    quiet = busy ? Duration.zero : Duration.sum(quiet, CHECK);
  }
});
