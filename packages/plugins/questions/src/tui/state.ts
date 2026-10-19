/**
 * The TUI part's shared state: the session on screen, what waits on the user there, the form's key
 * hints, and the calls that answer or cancel the waiting form.
 */

import { Effect, Predicate } from "effect";
import { createSignal } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import { type Hint, makeBridge, TuiDialogs, TuiHost, TuiToasts } from "@liminal/sdk/tui";

import { type Answers, NoForm, type Pending, QuestionsRpcs } from "../contract.ts";
import type { FormDeps } from "./QuestionForm.tsx";

/** Nothing waits. */
export const NONE: Pending = NoForm.make({});

/** Builds the part's signals and the form's actions over the questions RPCs. */
export const makeQuestionsState = Effect.gen(function* () {
  const host = yield* TuiHost;
  const bridge = yield* makeBridge;
  const dialogs = yield* TuiDialogs;
  const toasts = yield* TuiToasts;
  const client = yield* host.client(QuestionsRpcs);
  const [onScreen, setOnScreen] = createSignal<SessionId | undefined>();
  const [pending, setPending] = createSignal<Pending>(NONE);
  const [hints, setHints] = createSignal<ReadonlyArray<Hint>>([]);

  const call = <A, E extends { readonly message: string }>(effect: Effect.Effect<A, E>) => {
    bridge.run(
      effect.pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            toasts.show({ kind: "error", title: "Questions", message: error.message });
          }),
        ),
      ),
    );
  };

  const asked = () => {
    const now = pending();

    return Predicate.isTagged(now, "Asked") ? now : undefined;
  };

  /** Runs `act` with the session on screen and the waiting form's seq, when both exist. */
  const withForm = (act: (session: SessionId, seq: number) => void) => () => {
    const session = onScreen();
    const form = asked();

    if (session !== undefined && form !== undefined) act(session, form.seq);
  };

  const deps: FormDeps = {
    send: (answers: Answers) => {
      withForm((session, seq) => {
        call(client["questions/answer"]({ session, seq, answers }));
      })();
    },
    cancel: withForm((session, seq) => {
      call(client["questions/cancel"]({ session, seq }));
    }),
    setHints,
    dialogOpen: () => dialogs.top() !== undefined,
  };

  return { bridge, client, call, onScreen, setOnScreen, setPending, hints, asked, deps };
});

/** The part's shared state. */
export type QuestionsState = Effect.Success<typeof makeQuestionsState>;
