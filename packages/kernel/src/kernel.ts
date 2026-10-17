/** The kernel: boots the plugins and serves them to clients over the protocol. */

import { type Context, Effect, Layer, type Scope } from "effect";
import { RpcClient, RpcSerialization, RpcServer } from "effect/rpc";
import { Socket, SocketServer } from "effect/socket";

import { EventBus } from "@liminal/sdk";

import { boot, type BootOptions } from "./host/host.ts";
import type { PluginStatus } from "./host/status.ts";
import { makeMemoryServer } from "./server/memory.ts";
import { serve } from "./server/serve.ts";

export interface Kernel {
  readonly status: ReadonlyArray<PluginStatus>;
  /** Every active plugin's services, for code running in the kernel's process. */
  readonly services: Context.Context<never>;
  /** A client protocol over a new in-memory connection; closing the scope disconnects. */
  readonly connect: Effect.Effect<RpcClient.Protocol["Service"], never, Scope.Scope>;
}

/** Boots the plugins and serves them until the scope closes. */
export const start = Effect.fn("start")(function* (options: BootOptions) {
  const bus = yield* Layer.build(EventBus.layer);
  const booted = yield* boot(options).pipe(Effect.provideContext(bus));
  const memory = yield* makeMemoryServer;

  const protocol = yield* RpcServer.makeProtocolSocketServer.pipe(
    Effect.provideService(SocketServer.SocketServer, memory.server),
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
  );

  yield* serve(booted).pipe(
    Effect.provideService(RpcServer.Protocol, protocol),
    Effect.provideContext(bus),
    Effect.forkScoped,
  );

  const connect = Effect.flatMap(memory.connect, (socket) =>
    RpcClient.makeProtocolSocket().pipe(
      Effect.provideService(Socket.Socket, socket),
      Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
    ),
  );

  const kernel: Kernel = { status: booted.status, services: booted.services, connect };

  return kernel;
});
