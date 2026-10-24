/**
 * Commit's `tui` entry: `/commit`, which runs on the landing screen or in a session while no turn
 * runs. One flow runs at a time, for the whole workspace; its ask takes the composer's place on
 * every chat screen until it ends. Text after `/commit` steers the plan, and the small model of the
 * selected model's provider plans.
 */
import { Effect, Layer } from "effect";
import { createSignal, Show } from "solid-js";

import { ChatScreen, ComposerCovers, turnBlocked } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import { ModelSelection } from "@shanepadgett/liminal-model-choice/tui";
import {
  Dialogs,
  Keymap,
  makeEntryRun,
  Notifications,
  Pickers,
  registerCommands,
} from "@shanepadgett/liminal-tui";

import { CommitRpc } from "../contract.ts";
import { Commit } from "./Commit.tsx";
import { type CommitFlow, makeFlow } from "./flow.ts";

const make = Effect.gen(function* () {
  const host = yield* Host;
  const chat = yield* ChatScreen;
  const notifications = yield* Notifications;
  const selection = yield* ModelSelection;
  const run = yield* makeEntryRun("Commit failed.");
  const [flow, setFlow] = createSignal<CommitFlow>();

  const start = (instruction: string) => {
    if (flow() !== undefined) return;

    const made = makeFlow({ instruction, main: selection.selected()?.model }, notifications.post);
    setFlow(made.flow);

    run(
      Effect.scoped(Effect.flatMap(host.client(CommitRpc), made.run)).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            setFlow(undefined);
          }),
        ),
      ),
    );
  };

  yield* (yield* ComposerCovers).add({
    active: () => flow() !== undefined,
    component: () => <Show when={flow()}>{(shown) => <Commit flow={shown()} />}</Show>,
  });

  yield* registerCommands([
    {
      name: "commit.run",
      title: "Commit changes",
      category: "Session",
      slash: { name: "commit" },
      argument: { kind: "optional", hint: "guidance" },
      blocked: turnBlocked(chat, "commit"),
      run: start,
    },
  ]);
});

export default definePlugin({
  name: "commit-tui",
  provides: [],
  requires: [
    Host,
    Dialogs,
    Pickers,
    Keymap,
    Notifications,
    ChatScreen,
    ComposerCovers,
    ModelSelection,
  ],
  layer: Layer.effectDiscard(make),
});
