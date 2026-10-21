/** Logins' server: the login methods registry, each method's sign-in state, and the login RPCs. */

import { Effect, Exit, Layer, Option } from "effect";

import { type CredentialError, CredentialStore } from "@liminal/credential-store/contract";
import { KeyedRegistry } from "@liminal/sdk";

import {
  FromEnv,
  LoginFailed,
  LoginMethod,
  LoginMethods,
  LoginsRpcs,
  type MethodInfo,
  Saved,
  SignedOut,
} from "./contract.ts";
import { makeRunner } from "./server/flow.ts";

const failed = (error: CredentialError) =>
  new LoginFailed({ method: error.method, message: error.message });

const rpcs = LoginsRpcs.toLayer(
  Effect.gen(function* () {
    const methods = yield* LoginMethods;
    const store = yield* CredentialStore;
    const runner = yield* makeRunner;

    /** Saved when the store holds a credential; an API key may come from its variable instead. */
    const stateOf = Effect.fn("Logins.stateOf")(function* (method: LoginMethod) {
      if (Option.isSome(yield* store.get(method.id))) return Saved.make({});
      if (!LoginMethod.$is("ApiKey")(method)) return SignedOut.make({});

      const fromEnv = yield* store.secret(method.id, { env: method.env });

      return Option.isSome(fromEnv) ? FromEnv.make({ variable: method.env }) : SignedOut.make({});
    });

    const info = (method: LoginMethod) =>
      Effect.map(stateOf(method), (state): MethodInfo => ({
        id: method.id,
        vendor: method.vendor,
        title: method.title,
        ways: LoginMethod.$is("Flow")(method) ? method.ways : [],
        state,
      }));

    /**
     * Runs the method's own sign-out, if any, then removes the saved credential; a failed sign-out
     * still removes it, then fails with the sign-out's error.
     */
    const logout = Effect.fn("Logins.logout")(function* (id: string) {
      const method = yield* runner.find(id);

      const signedOut =
        LoginMethod.$is("Flow")(method) && Option.isSome(method.logOut)
          ? yield* Effect.exit(method.logOut.value)
          : Exit.void;

      yield* store.remove(id).pipe(Effect.mapError(failed));
      yield* signedOut;
    });

    return LoginsRpcs.of({
      "logins/list": () =>
        methods.list.pipe(
          Effect.flatMap((all) => Effect.forEach(all, info)),
          Effect.mapError(failed),
        ),
      "logins/start": ({ method, way }) => runner.start(method, way),
      "logins/answer": ({ method, text }) => runner.answer(method, text),
      "logins/logout": ({ method }) => logout(method),
    });
  }),
);

export const layer = rpcs.pipe(
  Layer.provideMerge(KeyedRegistry.layer(LoginMethods, (method) => method.id)),
);
