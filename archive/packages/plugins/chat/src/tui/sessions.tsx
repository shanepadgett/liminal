/** `/sessions`: picks one of this folder's sessions, newest first, and switches the chat to it. */

import { DateTime, Effect, SubscriptionRef } from "effect";

import type { SessionId } from "@liminal/sdk";
import {
  type DialogProps,
  makeBridge,
  SelectDialog,
  type SelectOption,
  TuiCommands,
  TuiDialogs,
  TuiHost,
} from "@liminal/sdk/tui";
import { SessionLogRpcs, type SessionSummary } from "@liminal/session-log/contract";

/** A session as a row: its name, then when it was last written. */
const optionOf = (session: SessionSummary): SelectOption<SessionId> => ({
  title: session.title === "" ? "Untitled session" : session.title,
  value: session.id,
  description: DateTime.formatLocal(session.updatedAt, { dateStyle: "medium", timeStyle: "short" }),
});

/** Registers `/sessions`, which sets `current` to the session picked. */
export const sessionsCommand = Effect.fn("sessionsCommand")(function* (
  current: SubscriptionRef.SubscriptionRef<SessionId>,
) {
  const host = yield* TuiHost;
  const bridge = yield* makeBridge;
  const dialogs = yield* TuiDialogs;
  const log = yield* host.client(SessionLogRpcs);

  const show = (sessions: ReadonlyArray<SessionSummary>, active: SessionId) => {
    dialogs.show((props: DialogProps) => (
      <SelectDialog
        title="Sessions"
        options={sessions.map(optionOf)}
        current={active}
        close={props.close}
        onSelect={(session) => {
          bridge.run(SubscriptionRef.set(current, session));
        }}
      />
    ));
  };

  const open = Effect.gen(function* () {
    const sessions = yield* log["session-log/list"]();
    show(sessions, yield* SubscriptionRef.get(current));
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
