/** Logs out of a provider: its logins end their sessions, then its credential is removed. */
import { Effect, Option } from "effect";

import { Credentials, LoginMethods, LogoutFailed } from "./contract.ts";

export const makeLogout = Effect.gen(function* () {
  const methods = yield* LoginMethods;
  const credentials = yield* Credentials;

  /**
   * Runs the `logOut` of each of the provider's logins, then removes the credential; a failed
   * `logOut` still removes it, then fails with its error.
   */
  return Effect.fn("Accounts.logout")(function* (provider: string) {
    const failed = (error: { readonly message: string }) =>
      new LogoutFailed({ provider, message: error.message });

    const saved = yield* credentials.get(provider).pipe(Effect.mapError(failed));

    if (Option.isNone(saved)) {
      return yield* new LogoutFailed({ provider, message: `No ${provider} login is saved.` });
    }

    const ends = (yield* methods.list).flatMap((method) =>
      method.provider === provider && method.logOut !== undefined ? [method.logOut] : [],
    );

    const ended = yield* Effect.exit(
      Effect.forEach(ends, (logOut) => logOut(saved.value), { discard: true }),
    );

    yield* credentials.remove(provider).pipe(Effect.mapError(failed));

    return yield* ended;
  });
});
