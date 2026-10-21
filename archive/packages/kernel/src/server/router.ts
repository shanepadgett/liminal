/**
 * Routes one transport's clients between the kernel's server and each graph's server. A request
 * holds the graph current when it arrives until its Exit goes out.
 */

import { Effect, Predicate, Queue, Scope, Semaphore } from "effect";
import { RpcGroup, type RpcMessage, RpcServer } from "effect/rpc";

import { KernelRpcs } from "@liminal/sdk";

import type { Graph, Graphs } from "../graph/graphs.ts";

type Protocol = RpcServer.Protocol["Service"];

/** A server's view of the transport: what it is fed, and the clients it must drop. */
interface Target {
  readonly protocol: Protocol;
  readonly write: (clientId: number, message: RpcMessage.FromClientEncoded) => Effect.Effect<void>;
  readonly disconnects: Queue.Queue<number>;
}

/** Where a request went, and the graph it holds when a graph's server answers it. */
interface Route {
  readonly target: Target;
  readonly graph: Graph | undefined;
}

interface TargetHooks {
  /** Runs after each response reaches the transport. */
  readonly sent: (clientId: number, response: RpcMessage.FromServerEncoded) => Effect.Effect<void>;
  readonly end: (clientId: number) => Effect.Effect<void>;
}

const makeTarget = Effect.fn("makeTarget")(function* (transport: Protocol, hooks: TargetHooks) {
  const disconnects = yield* Queue.unbounded<number>();
  const written: Array<Target["write"]> = [];

  // Protocol.make hands over exactly one write function, before it returns.
  const protocol = yield* RpcServer.Protocol.make((write) => {
    written.push(write);

    return Effect.succeed({
      disconnects,
      send: (clientId, response, transferables) =>
        Effect.andThen(
          transport.send(clientId, response, transferables),
          hooks.sent(clientId, response),
        ),
      end: hooks.end,
      clientIds: transport.clientIds,
      initialMessage: transport.initialMessage,
      supportsAck: transport.supportsAck,
      supportsTransferables: transport.supportsTransferables,
      supportsSpanPropagation: transport.supportsSpanPropagation,
      supportsNotifications: transport.supportsNotifications,
      codecFor: transport.codecFor,
    });
  });

  const target: Target = {
    protocol,
    write: (clientId, message) => Effect.forEach(written, (write) => write(clientId, message)),
    disconnects,
  };

  return target;
});

/** Each client's open requests by request id, and every server it has reached. */
const makeRoutes = (graphs: Graphs) => {
  const byClient = new Map<number, Map<string, Route>>();
  const reached = new Map<number, Set<Target>>();

  const routesOf = (clientId: number) => {
    const found = byClient.get(clientId) ?? new Map<string, Route>();
    byClient.set(clientId, found);

    return found;
  };

  const add = (clientId: number, id: string, route: Route) => {
    routesOf(clientId).set(id, route);
    reached.set(clientId, (reached.get(clientId) ?? new Set()).add(route.target));
  };

  const targetsOf = (clientId: number) => [...(reached.get(clientId) ?? [])];

  const releaseRoute = (route: Route | undefined) =>
    route?.graph === undefined ? Effect.void : graphs.release(route.graph);

  /** Ends a request's route once its Exit has gone out. */
  const settle = (clientId: number, response: RpcMessage.FromServerEncoded) => {
    if (!Predicate.isTagged(response, "Exit")) return Effect.void;
    const routes = routesOf(clientId);
    const id = String(response.requestId);
    const route = routes.get(id);
    routes.delete(id);

    return releaseRoute(route);
  };

  /** Drops a client's routes; its servers drop its requests without answering them. */
  const drop = (clientId: number) => {
    const routes = [...routesOf(clientId).values()];
    byClient.delete(clientId);
    reached.delete(clientId);

    return Effect.forEach(routes, releaseRoute, { discard: true });
  };

  return { routesOf, add, targetsOf, settle, drop };
};

/** Each graph's server, started on its first request and stopped when the graph closes. */
const makeServers = Effect.fn("makeServers")(function* (
  transport: Protocol,
  settle: TargetHooks["sent"],
) {
  const servers = new Map<Graph, Target>();
  const lock = yield* Semaphore.make(1);

  return (graph: Graph) =>
    lock.withPermit(
      Effect.gen(function* () {
        const existing = servers.get(graph);
        if (existing !== undefined) return existing;

        const target = yield* makeTarget(transport, { sent: settle, end: () => Effect.void });

        // A defect fails only its own call, not the client's connection.
        yield* RpcServer.make(RpcGroup.make().merge(...graph.rpcs), {
          disableFatalDefects: true,
        }).pipe(
          Effect.provideService(RpcServer.Protocol, target.protocol),
          Effect.provideContext(graph.services),
          Effect.forkIn(graph.scope),
        );

        servers.set(graph, target);

        yield* Scope.addFinalizer(
          graph.scope,
          Effect.sync(() => servers.delete(graph)),
        );

        return target;
      }),
    );
});

/** Feeds the transport's messages to the kernel server and the current graph's servers. */
export const route = Effect.fn("route")(function* (
  transport: Protocol,
  graphs: Graphs,
  serveKernel: Effect.Effect<never, never, RpcServer.Protocol>,
) {
  const routes = makeRoutes(graphs);
  const kernel = yield* makeTarget(transport, { sent: routes.settle, end: transport.end });
  yield* Effect.forkScoped(Effect.provideService(serveKernel, RpcServer.Protocol, kernel.protocol));
  const serverOf = yield* makeServers(transport, routes.settle);

  const request = Effect.fn("request")(function* (
    clientId: number,
    message: RpcMessage.RequestEncoded,
  ) {
    const id = String(message.id);

    if (KernelRpcs.requests.has(message.tag)) {
      routes.add(clientId, id, { target: kernel, graph: undefined });
      yield* kernel.write(clientId, message);

      return;
    }

    const graph = yield* graphs.acquire;
    const target = yield* serverOf(graph);
    routes.add(clientId, id, { target, graph });
    yield* target.write(clientId, message);
  });

  /** The kernel server, then every graph server the client has reached. */
  const targetsOf = (clientId: number) => [
    kernel,
    ...routes.targetsOf(clientId).filter((target) => target !== kernel),
  ];

  const dispatch = (clientId: number, message: RpcMessage.FromClientEncoded) => {
    if (Predicate.isTagged(message, "Request")) return request(clientId, message);

    if (Predicate.isTagged(message, "Ack") || Predicate.isTagged(message, "Interrupt")) {
      const found = routes.routesOf(clientId).get(String(message.requestId));

      return (found?.target ?? kernel).write(clientId, message);
    }

    if (Predicate.isTagged(message, "Eof"))
      return Effect.forEach(targetsOf(clientId), (target) => target.write(clientId, message));

    return kernel.write(clientId, message);
  };

  const disconnect = (clientId: number) =>
    Effect.forEach(targetsOf(clientId), (target) => Queue.offer(target.disconnects, clientId)).pipe(
      Effect.andThen(routes.drop(clientId)),
    );

  yield* Effect.forkScoped(
    Effect.forever(Effect.flatMap(Queue.take(transport.disconnects), disconnect)),
  );

  return yield* transport.run(dispatch);
});
