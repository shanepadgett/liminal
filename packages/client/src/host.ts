/** How a frontend reaches plugins: a client for any plugin's RPC group, whatever the connection. */
import { Context, Effect, Layer, type Scope } from "effect";
import { type Rpc, type RpcClient, type RpcGroup, RpcTest } from "effect/rpc";

export class Host extends Context.Service<
  Host,
  {
    /** A client for `group`, open for the caller's scope. */
    readonly client: <R extends Rpc.Any>(
      group: RpcGroup.RpcGroup<R>,
    ) => Effect.Effect<RpcClient.RpcClient<R>, never, Scope.Scope>;
  }
>()("client/Host") {}

/**
 * The host in the composition's own process: each client calls the handlers in the plugins' layers
 * directly, without serializing. Provide it the composition.
 */
export const inMemory = Layer.effect(
  Host,
  Effect.map(Effect.context(), (composition) => {
    const client = <R extends Rpc.Any>(group: RpcGroup.RpcGroup<R>) =>
      // RpcTest is Effect's in-memory client: the no-serialization path, despite its name.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion, effecttsgo/unsafe-effect-type-assertion -- the composition holds every plugin's handlers; a group no plugin composes fails on its first call.
      RpcTest.makeClient(group).pipe(Effect.provide(composition)) as Effect.Effect<
        RpcClient.RpcClient<R>,
        never,
        Scope.Scope
      >;

    return Host.of({ client });
  }),
);
