/**
 * Commit's TUI part: `/commit [instruction]` runs the commit flow for the session on screen in its
 * dialog, and ends with one toast.
 */

import { Effect } from "effect";
import { createSignal, onCleanup } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import {
  defineTui,
  makeBridge,
  TuiCommands,
  TuiDialogs,
  TuiHost,
  TuiInputWaits,
  type ToastKind,
  TuiToasts,
} from "@liminal/sdk/tui";

import { CommitRpcs } from "./contract.ts";
import { CommitDialog } from "./tui/CommitDialog.tsx";
import { type FlowDeps, makeFlow } from "./tui/flow.ts";

/** After questions' line; draws nothing. */
const LINE_ORDER = 40;

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const dialogs = yield* TuiDialogs;
    const toasts = yield* TuiToasts;
    const [isRunning, setRunning] = createSignal(false);

    const finish = (text: string, kind: ToastKind) => {
      setRunning(false);
      dialogs.close();
      toasts.show({ kind, title: "Commit", message: text });
    };

    const inputWaits = yield* TuiInputWaits;

    const deps: FlowDeps = {
      client: yield* host.client(CommitRpcs),
      finish,
      waitForUser: inputWaits.waitForUser,
    };

    const bridge = yield* makeBridge;
    const [onScreen, setOnScreen] = createSignal<SessionId | undefined>();

    const start = (session: SessionId, instruction: string) => {
      const { flow, run } = makeFlow(deps, session, instruction);

      setRunning(true);
      dialogs.show(() => <CommitDialog flow={flow} />);
      bridge.run(run);
    };

    const commands = yield* TuiCommands;

    yield* commands.register([
      {
        name: "commit.run",
        title: "Commit",
        desc: "Check, plan and commit every change, then ask before pushing",
        category: "Session",
        slash: { name: "commit", arguments: "optional" },
        palette: true,
        run: (instruction) => {
          const session = onScreen();
          if (session !== undefined && !isRunning()) start(session, instruction);
        },
      },
    ]);

    yield* host.register(
      ChatSlots.composerLine,
      { id: "commit", order: LINE_ORDER },
      function OnScreen(props: { readonly sessionId: SessionId }) {
        setOnScreen(props.sessionId);

        onCleanup(() => {
          setOnScreen();
        });

        return null;
      },
    );
  }),
});
