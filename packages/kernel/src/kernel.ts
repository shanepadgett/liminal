/** The kernel: holds the plugin graphs and serves them to clients over the protocol. */

import { Effect, Layer, type Scope } from "effect";
import { RpcClient, RpcSerialization, RpcServer } from "effect/rpc";
import { Socket, SocketServer } from "effect/socket";

import { EventBus, type HoldGraph } from "@liminal/sdk";

import type { ChangeFailed } from "./graph/change.ts";
import { makeGraphs } from "./graph/graphs.ts";
import type { BootOptions } from "./host/host.ts";
import type { PluginStatus } from "./host/status.ts";
import { makeMemoryServer } from "./server/memory.ts";
import { route } from "./server/router.ts";
import { serveKernel } from "./server/serve.ts";

export interface Kernel {
  /** The current graph's plugin states. */
  readonly status: Effect.Effect<ReadonlyArray<PluginStatus>>;
  /** Runs code in the kernel's process against the current graph's services. */
  readonly use: HoldGraph;
  /**
   * Rebuilds the named plugins, their dependents, and plugins whose resolution changed, then swaps
   * the new graph in; work already running finishes on the graph it holds.
   */
  readonly reload: (
    names: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<PluginStatus>, ChangeFailed>;
  /** A client protocol over a new in-memory connection; closing the scope disconnects. */
  readonly connect: Effect.Effect<RpcClient.Protocol["Service"], never, Scope.Scope>;
}

/** Builds the first graph and serves it, and each one after, until the scope closes. */
export const start = Effect.fn("start")(function* (options: BootOptions) {
  const bus = yield* Layer.build(EventBus.layer);
  const graphs = yield* makeGraphs(options.folders).pipe(Effect.provideContext(bus));
  const memory = yield* makeMemoryServer;

  const transport = yield* RpcServer.makeProtocolSocketServer.pipe(
    Effect.provideService(SocketServer.SocketServer, memory.server),
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
  );

  yield* route(transport, graphs, serveKernel(graphs).pipe(Effect.provideContext(bus))).pipe(
    Effect.forkScoped,
  );

  const connect = Effect.flatMap(memory.connect, (socket) =>
    RpcClient.makeProtocolSocket().pipe(
      Effect.provideService(Socket.Socket, socket),
      Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
    ),
  );

  const kernel: Kernel = {
    status: Effect.acquireUseRelease(
      graphs.acquire,
      (graph) => Effect.succeed(graph.status),
      graphs.release,
    ),
    use: graphs.hold,
    reload: graphs.reload,
    connect,
  };

  return kernel;
});
