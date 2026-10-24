/** Credentials in `liminal.db`, the login methods providers add, and the sign-in screens run. */
import { Crypto, Effect, Layer, Option } from "effect";
import { ChildProcessSpawner } from "effect/process";
import { SqlClient } from "effect/sql";

import { definePlugin, Registry } from "@shanepadgett/liminal-core";

import { keyCommandsLayer } from "./command.ts";
import { AccountsRpc, Credentials, type LoginMethod, LoginMethods, savedKind } from "./contract.ts";
import { makeLogout } from "./logout.ts";
import { makeSignIn } from "./sign-in.ts";
import { makeStore } from "./store.ts";

/**
 * The logins in the order screens list them: vendors as first added, and under each vendor its
 * subscriptions before its API keys.
 */
const subscriptionsFirst = (list: ReadonlyArray<LoginMethod>) =>
  [...new Set(list.map((method) => method.vendor))].flatMap((vendor) => {
    const own = list.filter((method) => method.vendor === vendor);

    return own
      .filter((method) => method.credential === "oauth")
      .concat(own.filter((method) => method.credential === "key"));
  });

const rpc = AccountsRpc.toLayer(
  Effect.gen(function* () {
    const methods = yield* LoginMethods;
    const credentials = yield* Credentials;
    const { signIn, answer } = yield* makeSignIn;
    const logout = yield* makeLogout;

    return AccountsRpc.of({
      "accounts/methods": () =>
        Effect.flatMap(methods.list, (list) =>
          Effect.forEach(
            subscriptionsFirst(list),
            ({ id, provider, vendor, title, credential, ways }) =>
              Effect.map(savedKind(credentials, provider), (saved) => ({
                id,
                provider,
                vendor,
                title,
                ways: ways.map((way) => ({ id: way.id, title: way.title })),
                connected: Option.contains(saved, credential),
              })),
          ),
        ),
      "accounts/sign-in": ({ method, way }) => signIn(method, way),
      "accounts/answer": ({ method, text }) => answer(method, text),
      "accounts/logout": ({ provider }) => logout(provider),
    });
  }),
);

const services = Layer.merge(
  Layer.effect(Credentials, makeStore),
  Layer.effect(LoginMethods, Registry.make<LoginMethod>()),
);

export default definePlugin({
  name: "accounts",
  provides: [Credentials, LoginMethods],
  requires: [SqlClient.SqlClient, Crypto.Crypto, ChildProcessSpawner.ChildProcessSpawner],
  layer: Layer.provideMerge(rpc, services).pipe(Layer.provide(keyCommandsLayer)),
  entries: { tui: () => import("./tui/index.tsx") },
});
