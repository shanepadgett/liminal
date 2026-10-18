/**
 * Inbox's TUI part: the composer, which takes chat's composer slot at priority 0 and always
 * matches, and its key hints.
 */

import { Effect, Predicate, Stream } from "effect";
import { createSignal } from "solid-js";

import { AgentLoopRpcs, type DefaultsView } from "@liminal/agent-loop/contract";
import { ChatSlots } from "@liminal/chat/contract";
import { defineTui, makeBridge, TuiCommands, TuiDialogs, TuiHost } from "@liminal/sdk/tui";

import { InboxRpcs, type Queued } from "./contract.ts";
import { type ComposerDeps, makeComposer, makeHints, type ModelLine } from "./tui/Composer.tsx";

const noQueue: Queued = { steers: [], followUps: [] };
const loading: ModelLine = { set: false, reason: "" };

const modelLine = (view: DefaultsView): ModelLine =>
  Predicate.isTagged(view, "DefaultsSet")
    ? { set: true, model: view.settings.model.id, thinking: view.thinkingLabel ?? "" }
    : { set: false, reason: view.message };

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const inbox = yield* host.client(InboxRpcs);
    const loop = yield* host.client(AgentLoopRpcs);
    const drafts = host.sessionState("draft", () => createSignal(""));
    const [problem, setProblem] = createSignal("");
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;

    const model = bridge.watch(loop["agent-loop/defaults"]().pipe(Stream.map(modelLine)), loading);

    const deps: ComposerDeps = {
      draft: (session) => drafts.of(session),
      send: (session, text, mode) => {
        bridge.run(
          inbox["inbox/send"]({ session, text, mode }).pipe(
            Effect.match({
              onFailure: (error) => setProblem(error.message),
              onSuccess: () => setProblem(""),
            }),
          ),
        );
      },
      queue: (session) => bridge.watch(inbox["inbox/queue"]({ session }), noQueue),
      model,
      problem,
      commands,
      dialogOpen: () => dialogs.top() !== undefined,
    };

    yield* host.register(
      ChatSlots.composer,
      { select: () => true, priority: 0 },
      makeComposer(deps),
    );

    yield* host.register(ChatSlots.hints, { id: "inbox", order: 0 }, makeHints(deps));
  }),
});
