/** Credentials in `liminal.db`, the login methods providers add, and the sign-in screens run. */
import { Crypto, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";

import { definePlugin, Registry } from "@shanepadgett/liminal-core";

import { AccountsRpc, Credentials, type LoginMethod, LoginMethods } from "./contract.ts";
import { makeSignIn } from "./sign-in.ts";
import { makeStore } from "./store.ts";

const rpc = AccountsRpc.toLayer(
  Effect.map(makeSignIn, ({ methods, signIn, answer }) =>
    AccountsRpc.of({
      "accounts/methods": () =>
        Effect.map(methods.list, (list) =>
          list.map(({ id, provider, title }) => ({ id, provider, title })),
        ),
      "accounts/sign-in": ({ method }) => signIn(method),
      "accounts/answer": ({ method, text }) => answer(method, text),
    }),
  ),
);

const services = Layer.merge(
  Layer.effect(Credentials, makeStore),
  Layer.effect(LoginMethods, Registry.make<LoginMethod>()),
);

export default definePlugin({
  name: "accounts",
  provides: [Credentials, LoginMethods],
  requires: [SqlClient.SqlClient, Crypto.Crypto],
  layer: Layer.provideMerge(rpc, services),
});
