/** The kernel's own commands: following sessions, the event bus, and the plugins' states. */

import { Effect, Option, Stream } from "effect";
import { RpcServer } from "effect/rpc";

import { ActivePlugin, EventBus, InactivePlugin, KernelRpcs, type PluginState } from "@liminal/sdk";

import { type Graphs, membersOf } from "../graph/graphs.ts";
import { describeReason, PluginStatus } from "../host/status.ts";
import type { Reloads } from "../reload/run.ts";
import { followAcross } from "./follow.ts";

const toState: (status: PluginStatus) => PluginState = PluginStatus.$match({
  Active: ({ name }) => ActivePlugin.make({ name }),
  Inactive: ({ name, reason }) => InactivePlugin.make({ name, reason: describeReason(reason) }),
});

/** Runs until interrupted, answering the kernel's commands from the Protocol it is given. */
export const serveKernel = Effect.fn("serveKernel")(function* (graphs: Graphs, reloads: Reloads) {
  const bus = yield* EventBus;

  const handlers = yield* KernelRpcs.toHandlers(
    KernelRpcs.of({
      "kernel/follow": ({ session, after }) =>
        followAcross(graphs.changes, session, Option.fromNullishOr(after)),
      "kernel/events": () => bus.events,
      "kernel/plugins": () =>
        Effect.acquireUseRelease(
          graphs.acquire,
          (graph) => Effect.succeed(graph.status.map(toState)),
          graphs.release,
        ),
      "kernel/graph": () =>
        graphs.changes.pipe(
          Stream.map((graph) => membersOf(graph).map(({ name, build }) => ({ name, build }))),
        ),
      "kernel/reload": () => reloads.state,
      "kernel/reload-now": () => reloads.request,
    }),
  );

  // A defect fails only its own call, not the client's connection.
  return yield* RpcServer.make(KernelRpcs, { disableFatalDefects: true }).pipe(
    Effect.provideContext(handlers),
  );
});
