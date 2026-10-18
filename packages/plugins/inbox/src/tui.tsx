/**
 * Inbox's TUI part: the composer, which takes chat's composer slot at priority 0 and always
 * matches, and its key hints.
 */

import { Effect, Stream } from "effect";
import { createSignal } from "solid-js";

import { AgentLoopRpcs } from "@liminal/agent-loop/contract";
import { ChatSlots } from "@liminal/chat/contract";
import { defineTui, makeBridge, TuiHost } from "@liminal/sdk/tui";

import { InboxRpcs, type Queued } from "./contract.ts";
import { type ComposerDeps, makeComposer, makeHints, type ModelLine } from "./tui/Composer.tsx";

const noQueue: Queued = { steers: [], followUps: [] };
const loading: ModelLine = { set: false, reason: "" };

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const inbox = yield* host.client(InboxRpcs);
    const loop = yield* host.client(AgentLoopRpcs);
    const drafts = host.sessionState("draft", () => createSignal(""));
    const [problem, setProblem] = createSignal("");

    const model = bridge.watch(
      Stream.fromEffect(
        loop["agent-loop/defaults"]().pipe(
          Effect.match({
            onFailure: (error): ModelLine => ({ set: false, reason: error.message }),
            onSuccess: (settings): ModelLine => ({
              set: true,
              model: settings.model.id,
              thinking: settings.thinking,
            }),
          }),
        ),
      ),
      loading,
    );

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
    };

    yield* host.register(
      ChatSlots.composer,
      { select: () => true, priority: 0 },
      makeComposer(deps),
    );

    yield* host.register(ChatSlots.hints, { id: "inbox", order: 0 }, makeHints(deps));
  }),
});
