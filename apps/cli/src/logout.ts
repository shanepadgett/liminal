/** `liminal logout`: pick a connected provider and log out of it. */
import { Console, Effect } from "effect";

import { AccountsRpc, type LoginMethodInfo } from "@shanepadgett/liminal-accounts/contract";
import { Host } from "@shanepadgett/liminal-client";

import { pick } from "./connect.ts";

/** One choice per connected provider; the provider id is shown when its vendor has several. */
const choicesOf = (methods: ReadonlyArray<typeof LoginMethodInfo.Type>) => {
  const connected = new Map(
    methods.flatMap((method) =>
      method.connected ? [[method.provider, method.vendor] as const] : [],
    ),
  );

  const vendors = [...connected.values()];

  return [...connected].map(([provider, vendor]) => {
    const title =
      vendors.filter((each) => each === vendor).length > 1 ? `${vendor} (${provider})` : vendor;

    return { title, value: { provider, title } };
  });
};

export const logout = Effect.gen(function* () {
  const host = yield* Host;
  const accounts = yield* host.client(AccountsRpc);
  const choices = choicesOf(yield* accounts["accounts/methods"]());

  if (choices.length === 0) {
    yield* Console.log("No provider is connected.");

    return;
  }

  const { provider, title } = yield* pick("Log out of", choices);
  yield* accounts["accounts/logout"]({ provider });
  yield* Console.log(`Logged out of ${title}.`);
});
