/** Logins' TUI part: `/connect` signs in to a provider and out again. */

import { Effect } from "effect";

import { defineTui, makeBridge, TuiCommands, TuiDialogs, TuiHost } from "@liminal/sdk/tui";

import { LoginsRpcs } from "./contract.ts";
import { makeConnect } from "./tui/connect.tsx";

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;
    const open = makeConnect(bridge, dialogs, yield* host.client(LoginsRpcs));

    yield* commands.register([
      {
        name: "logins.connect",
        title: "Connect a provider",
        desc: "Sign in to a provider, or out of one",
        category: "Model",
        slash: { name: "connect" },
        palette: true,
        run: open,
      },
    ]);
  }),
});
