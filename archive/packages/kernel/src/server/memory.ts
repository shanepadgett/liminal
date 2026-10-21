/**
 * The in-memory transport: socket pairs over queues, so a client in the same process speaks the
 * same serialized protocol as one over a real socket.
 */

import { Effect, FiberSet, Queue, type Scope } from "effect";
import { NetAddress } from "effect/net";
import { Socket, SocketServer } from "effect/socket";

/** What one side writes: a frame, or the close that ends the connection. */
type Frame = Uint8Array | string | Socket.CloseEvent;

const closed = (event: Socket.CloseEvent) =>
  new Socket.SocketError({
    reason: new Socket.SocketCloseError({ code: event.code, closeReason: event.reason }),
  });

/** One end of a pair: reads what the other end writes. */
const end = (incoming: Queue.Queue<Frame>, outgoing: Queue.Queue<Frame>): Socket.Socket =>
  Socket.make({
    reader: Effect.succeed({
      pull: Effect.flatMap(Queue.take(incoming), (frame) =>
        Socket.isCloseEvent(frame)
          ? Effect.fail(closed(frame))
          : Effect.succeed<readonly [Uint8Array | string]>([frame]),
      ),
      upgrade: () =>
        Effect.fail(new Socket.SocketError({ reason: new Socket.SocketUpgradeError({}) })),
    }),
    writer: Effect.succeed({
      write: (chunk) => Effect.asVoid(Queue.offer(outgoing, chunk)),
      writeAll: (chunks) => Effect.asVoid(Queue.offerAll(outgoing, chunks)),
    }),
  });

/** An in-memory server and how to open a connection to it. */
export interface MemoryServer {
  readonly server: SocketServer.SocketServer["Service"];
  /** A client socket; closing the scope closes the connection for both ends. */
  readonly connect: Effect.Effect<Socket.Socket, never, Scope.Scope>;
}

export const makeMemoryServer = Effect.gen(function* () {
  const accepted = yield* Queue.unbounded<Socket.Socket>();

  const connect = Effect.gen(function* () {
    const toServer = yield* Queue.unbounded<Frame>();
    const toClient = yield* Queue.unbounded<Frame>();

    yield* Effect.addFinalizer(() => Queue.offer(toServer, new Socket.CloseEvent()));
    yield* Queue.offer(accepted, end(toServer, toClient));

    return end(toClient, toServer);
  });

  const server = SocketServer.SocketServer.of({
    address: NetAddress.unixPathAddress("liminal-memory"),
    run: (handler) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handlers = yield* FiberSet.make();

          return yield* Effect.forever(
            Effect.flatMap(Queue.take(accepted), (socket) =>
              FiberSet.run(handlers, Effect.ignore(handler(socket))),
            ),
          );
        }),
      ),
  });

  const memory: MemoryServer = { server, connect };

  return memory;
});
