/**
 * Trust's TUI part: while the workspace is untrusted and the user has not answered this run, the
 * trust prompt and its key hints take chat's composer slots at priority -1, ahead of the composer.
 */

import { Effect, Option, Schema, Stream } from "effect";
import { createSignal } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import { defineTui, makeBridge, TuiDialogs, TuiHost } from "@liminal/sdk/tui";

import { TrustRpcs, type TrustState } from "./contract.ts";
import { makePrompt, type PromptDeps, TrustHints } from "./tui/TrustPrompt.tsx";

/** Ahead of the composer, which holds priority 0. */
const priority = -1;

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const dialogs = yield* TuiDialogs;
    const client = yield* host.client(TrustRpcs);
    // Kept, so an answer holds across reloads and restarts until the app quits.
    const kept = host.keep("answered", Schema.Boolean, () => false);
    const [answered, setAnswered] = createSignal(kept.get());
    const [problem, setProblem] = createSignal("");

    const state = bridge.watch(
      Stream.fromEffect(client["trust/workspace"]()).pipe(Stream.map(Option.some)),
      Option.none<TrustState>(),
    );

    const finish = () => {
      kept.set(true);
      setAnswered(true);
    };

    const deps: PromptDeps = {
      workspace: () =>
        Option.match(state(), { onNone: () => "", onSome: (each) => each.workspace }),
      problem,
      dialogOpen: () => dialogs.top() !== undefined,
      trust: () => {
        bridge.run(
          client["trust/trust"]().pipe(
            Effect.match({ onFailure: (error) => setProblem(error.message), onSuccess: finish }),
          ),
        );
      },
      decline: finish,
    };

    const asking = () => !answered() && Option.exists(state(), (each) => !each.trusted);
    const select = () => (asking() ? true : undefined);

    yield* host.register(ChatSlots.composer, { select, priority }, makePrompt(deps));
    yield* host.register(ChatSlots.composerHints, { select, priority }, TrustHints);
  }),
});
