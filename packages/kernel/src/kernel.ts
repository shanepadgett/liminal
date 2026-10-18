/** The kernel: holds the plugin graphs and serves them to clients over the protocol. */

import { Effect, Layer, type Scope, Stream } from "effect";
import { RpcClient, RpcSerialization, RpcServer } from "effect/rpc";
import { Socket, SocketServer } from "effect/socket";

import {
  type CompositionInvalid,
  EventBus,
  type GraphMember,
  type HoldGraph,
  makeTurnGate,
  TurnGate,
} from "@liminal/sdk";

import { makeGraphs, membersOf } from "./graph/graphs.ts";
import type { PartName } from "./host/build.ts";
import type { Composition } from "./host/host.ts";
import { type SharedModules, serveShared } from "./host/modules.ts";
import type { PluginStatus } from "./host/status.ts";
import { lockedReloads, type ReloadOptions, type Reloads, runReloads } from "./reload/run.ts";
import { makeMemoryServer } from "./server/memory.ts";
import { route } from "./server/router.ts";
import { serveKernel } from "./server/serve.ts";

export interface BootOptions {
  /**
   * Which plugins run; read for the first graph and again for each graph change. A failed first
   * read fails `start`; a later one fails that change's check.
   */
  readonly composition: Effect.Effect<Composition, CompositionInvalid>;
  /**
   * Packages the host imports once and serves to every plugin: `effect`, `@liminal/sdk`, and the
   * frontend's own.
   */
  readonly shared: SharedModules;
  /** Manifest parts imported with each build, such as `["tui"]`. */
  readonly parts: ReadonlyArray<PartName>;
  /** Absent: a locked plugin set that never reloads, as in tests and a web deployment. */
  readonly reload?: ReloadOptions;
}

export interface Kernel {
  /** The current graph's plugin states. */
  readonly status: Effect.Effect<ReadonlyArray<PluginStatus>>;
  /** Runs code in the kernel's process against the current graph's services. */
  readonly use: HoldGraph;
  /** Picking up changed code: its state, the reload command, and when to restart. */
  readonly reloads: Reloads;
  /** The current graph's active plugins, then the set after each graph change. */
  readonly graph: Stream.Stream<ReadonlyArray<GraphMember>>;
  /** A client protocol over a new in-memory connection; closing the scope disconnects. */
  readonly connect: Effect.Effect<RpcClient.Protocol["Service"], never, Scope.Scope>;
}

/** Builds the first graph and serves it, and each one after, until the scope closes. */
export const start = Effect.fn("start")(function* (options: BootOptions) {
  yield* serveShared(options.shared);
  const bus = yield* Layer.build(EventBus.layer);
  const turns = yield* makeTurnGate;

  const graphs = yield* makeGraphs({ composition: options.composition, parts: options.parts }).pipe(
    Effect.provideContext(bus),
    Effect.provideService(TurnGate, turns.gate),
  );

  const reloads =
    options.reload === undefined
      ? lockedReloads
      : yield* runReloads(options.reload, { graphs, close: turns.close });

  const memory = yield* makeMemoryServer;

  const transport = yield* RpcServer.makeProtocolSocketServer.pipe(
    Effect.provideService(SocketServer.SocketServer, memory.server),
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
  );

  const kernelServer = serveKernel(graphs, reloads).pipe(Effect.provideContext(bus));
  yield* route(transport, graphs, kernelServer).pipe(Effect.forkScoped);

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
    reloads,
    graph: graphs.changes.pipe(Stream.map(membersOf)),
    connect,
  };

  return kernel;
});
