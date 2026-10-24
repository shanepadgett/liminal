/**
 * Commit's `tui` entry: `/commit`, which runs only while no turn runs. Its ask takes the composer's
 * place until the flow ends; text after `/commit` steers the plan.
 */
import { Effect, Layer } from "effect";
import { createSignal, Show } from "solid-js";

import { ChatScreen, ComposerCovers, turnBlocked } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import type { SessionId } from "@shanepadgett/liminal-session/contract";
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
  const run = yield* makeEntryRun("Commit failed.");
  const [flows, setFlows] = createSignal<ReadonlyMap<SessionId, CommitFlow>>(new Map());

  const setFlow = (session: SessionId, flow: CommitFlow | undefined) => {
    setFlows((all) => {
      const next = new Map(all);

      if (flow === undefined) next.delete(session);
      else next.set(session, flow);

      return next;
    });
  };

  const start = (session: SessionId, instruction: string) => {
    if (flows().has(session)) return;

    const { flow, run: flowRun } = makeFlow(instruction, notifications.post);
    setFlow(session, flow);

    run(
      Effect.scoped(Effect.flatMap(host.client(CommitRpc), flowRun)).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            setFlow(session, undefined);
          }),
        ),
      ),
    );
  };

  yield* (yield* ComposerCovers).add({
    active: (props) => flows().has(props.session),
    component: (props) => (
      <Show when={flows().get(props.session)}>{(flow) => <Commit flow={flow()} />}</Show>
    ),
  });

  yield* registerCommands([
    {
      name: "commit.run",
      title: "Commit changes",
      category: "Session",
      slash: { name: "commit" },
      argument: { kind: "optional", hint: "guidance" },
      enabled: () => chat.session() !== undefined,
      blocked: turnBlocked(chat, "commit"),
      run: (text) => {
        const session = chat.session();
        if (session !== undefined) start(session, text);
      },
    },
  ]);
});

export default definePlugin({
  name: "commit-tui",
  provides: [],
  requires: [Host, Dialogs, Pickers, Keymap, Notifications, ChatScreen, ComposerCovers],
  layer: Layer.effectDiscard(make),
});
