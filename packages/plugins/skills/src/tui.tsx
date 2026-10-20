/**
 * Skills' TUI part: physical skill management in the palette and slash-only invocation commands.
 * The manager refreshes commands after changes, skipping names owned by other plugins.
 */

import { Effect } from "effect";
import { createSignal, onCleanup } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import {
  defineTui,
  makeBridge,
  TuiCommands,
  TuiHost,
  TuiDialogs,
  TuiToasts,
} from "@liminal/sdk/tui";

import { SkillsRpcs } from "./contract.ts";
import { makeSkillCommands } from "./tui/commands.ts";
import { showSkillsDialog } from "./tui/SkillsDialog.tsx";

/** After commit's line; draws nothing. */
const LINE_ORDER = 50;

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const toasts = yield* TuiToasts;
    const client = yield* host.client(SkillsRpcs);
    const bridge = yield* makeBridge;
    const [onScreen, setOnScreen] = createSignal<SessionId | undefined>();
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;
    const { refresh: refreshCommands } = yield* makeSkillCommands(onScreen);

    yield* commands.register([
      {
        name: "skills.manage",
        title: "Manage skills",
        category: "Skills",
        palette: true,
        desc: "List skill folders and delete skills or symlinks",
        run: () => {
          showSkillsDialog({ client, bridge, dialogs, refreshCommands });
        },
      },
    ]);

    yield* refreshCommands.pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          toasts.show({ kind: "error", title: "Skills", message: error.message });
        }),
      ),
      Effect.forkScoped,
    );

    yield* host.register(
      ChatSlots.composerLine,
      { id: "skills", order: LINE_ORDER },
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
