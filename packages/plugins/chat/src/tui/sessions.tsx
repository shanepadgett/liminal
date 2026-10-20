/** `/sessions`: browse conversations in this workspace without changing archive state on open. */

import { DateTime, Effect, SubscriptionRef } from "effect";

import type { SessionId } from "@liminal/sdk";
import {
  type DialogProps,
  makeBridge,
  TuiCommands,
  TuiDialogs,
  TuiHost,
  TuiToasts,
} from "@liminal/sdk/tui";
import { SessionLogRpcs } from "@liminal/session-log/contract";

import { SessionsDialog } from "./SessionsDialog.tsx";

export const sessionsCommand = Effect.fn("sessionsCommand")(function* (
  current: SubscriptionRef.SubscriptionRef<SessionId>,
) {
  const host = yield* TuiHost;
  const bridge = yield* makeBridge;
  const dialogs = yield* TuiDialogs;
  const toasts = yield* TuiToasts;
  const log = yield* host.client(SessionLogRpcs);

  const open = Effect.gen(function* () {
    const sessions = yield* log["session-log/list"]();
    const active = yield* SubscriptionRef.get(current);
    const now = yield* DateTime.now;

    dialogs.show((props: DialogProps) => (
      <SessionsDialog
        {...props}
        initial={sessions}
        active={active}
        now={now}
        log={log}
        bridge={bridge}
        toasts={toasts}
        onSelect={(session) => {
          bridge.run(SubscriptionRef.set(current, session));
        }}
      />
    ));
  });

  yield* (yield* TuiCommands).register([
    {
      name: "session.switch",
      title: "Sessions",
      desc: "Switch to a session started in this folder",
      category: "Session",
      slash: { name: "sessions" },
      palette: true,
      run: () => {
        bridge.run(open);
      },
    },
  ]);
});
