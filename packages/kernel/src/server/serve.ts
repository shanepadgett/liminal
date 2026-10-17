/** Serves one booted graph: the kernel's commands beside every active plugin's. */

import { Context, Effect, Option, Stream } from "effect";
import { RpcServer } from "effect/rpc";

import {
  ActivePlugin,
  EventBus,
  FeedMissing,
  InactivePlugin,
  KernelRpcs,
  type PluginState,
  SessionFeed,
} from "@liminal/sdk";

import type { Booted } from "../host/host.ts";
import { describeReason, PluginStatus } from "../host/status.ts";
import { follow } from "./follow.ts";

const toState: (status: PluginStatus) => PluginState = PluginStatus.$match({
  Active: ({ name }) => ActivePlugin.make({ name }),
  Inactive: ({ name, reason }) => InactivePlugin.make({ name, reason: describeReason(reason) }),
});

/** Runs until interrupted, answering every client of the Protocol it is given. */
export const serve = Effect.fn("serve")(function* (graph: Booted) {
  const bus = yield* EventBus;
  const feed = Context.getOption(graph.services, SessionFeed);
  const states = graph.status.map(toState);

  const kernel = yield* KernelRpcs.toHandlers(
    KernelRpcs.of({
      "kernel/follow": ({ session, after }) =>
        Option.match(feed, {
          onNone: () => Stream.fail(new FeedMissing()),
          onSome: (found) => follow(found, session, Option.fromNullishOr(after)),
        }),
      "kernel/events": () => bus.events,
      "kernel/plugins": () => Effect.succeed(states),
    }),
  );

  // The plugins' handlers are in the graph's services, built from layers definePlugin checked
  // against each plugin's group. A defect fails only its own call, not the client's connection.
  return yield* RpcServer.make(KernelRpcs.merge(...graph.rpcs), { disableFatalDefects: true }).pipe(
    Effect.provideContext(kernel),
    Effect.provideContext(graph.services),
  );
});
