/**
 * Questions' TUI part: `/qna` asks the model to put questions to the user; while a form waits, it
 * takes the composer's draft area and key hints at priority -1; the form and the answers show in
 * the transcript; and the `ask_question` call stays out of the work rows, worded while it streams.
 */

import { Effect } from "effect";
import { createEffect, onCleanup, Show } from "solid-js";

import { ChatSlots, ToolRows } from "@liminal/chat/contract";
import { InboxSlots } from "@liminal/inbox/contract";
import type { SessionId } from "@liminal/sdk";
import {
  defineTui,
  Hints,
  hintsPriority,
  PromptPriority,
  TuiCommands,
  TuiHost,
  useColor,
} from "@liminal/sdk/tui";

import { AnswersEntry, askQuestionTool, FormEntry } from "./contract.ts";
import { AnswersRow, AskedRow } from "./tui/entries.tsx";
import { QuestionForm } from "./tui/QuestionForm.tsx";
import { makeQuestionsState, NONE, type QuestionsState } from "./tui/state.ts";

/** Ahead of the draft, which holds priority 0, behind the approval and commit prompts. */
const priority = PromptPriority.questions;

/** Ahead of the composer's hints at 0. */
const formHintsPriority = hintsPriority(priority);

/** After the approval mode and references on the composer's model line. */
const LINE_ORDER = 30;

/** Follows what waits on the session on screen; draws nothing on the composer's model line. */
const registerWatch = (host: TuiHost["Service"], state: QuestionsState) =>
  host.register(
    ChatSlots.composerLine,
    { id: "questions", order: LINE_ORDER },
    function OnScreen(props: { readonly sessionId: SessionId }) {
      const watched = state.bridge.watch(
        state.client["questions/pending"]({ session: props.sessionId }),
        NONE,
      );

      state.setOnScreen(props.sessionId);

      createEffect(() => {
        state.setPending(watched());
      });

      onCleanup(() => {
        state.setOnScreen();
        state.setPending(NONE);
      });

      return null;
    },
  );

/** While a form waits, it takes the composer's draft area and key hints. */
const registerForm = (host: TuiHost["Service"], state: QuestionsState) => {
  const select = () => (state.asked() === undefined ? undefined : true);

  return Effect.gen(function* () {
    yield* host.register(InboxSlots.input, { select, priority }, function Form() {
      // Keyed, so a new form starts afresh.
      return (
        <Show when={state.asked()} keyed>
          {(form) => <QuestionForm form={form.form} deps={state.deps} />}
        </Show>
      );
    });

    yield* host.register(
      ChatSlots.composerHints,
      { select, priority: formHintsPriority },
      function FormHints() {
        const color = useColor();

        return <Hints color={color} hints={state.hints()} />;
      },
    );
  });
};

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const commands = yield* TuiCommands;
    const state = yield* makeQuestionsState;

    yield* commands.register([
      {
        name: "questions.ask",
        title: "Ask me questions",
        desc: "Have the assistant put its open questions to you as a form",
        category: "Session",
        slash: { name: "qna", arguments: "optional" },
        palette: true,
        run: (context) => {
          const session = state.onScreen();

          if (session !== undefined) {
            state.call(state.client["questions/ask"]({ session, context }));
          }
        },
      },
    ]);

    yield* registerWatch(host, state);
    yield* registerForm(host, state);

    yield* host.register(ChatSlots.entry, { key: FormEntry.kind, meta: {} }, AskedRow);

    yield* host.register(
      ChatSlots.entry,
      { key: AnswersEntry.kind, meta: { isBand: true } },
      AnswersRow,
    );

    yield* host.register(
      ChatSlots.tool,
      { key: askQuestionTool, meta: ToolRows.Hidden({ live: "Drafting questions" }) },
      () => null,
    );
  }),
});
