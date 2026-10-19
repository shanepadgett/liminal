/**
 * Questions' server: `ask_question`, the before-call hook that ends a turn on its form, and the
 * commands that send `/qna`'s request and the user's answers or cancel, offering and withdrawing
 * the tool.
 */

import { Effect, Predicate, Semaphore, Stream } from "effect";

import { BeforeCallHooks } from "@liminal/agent-loop/contract";
import { Inbox } from "@liminal/inbox/contract";
import { draft, type ModelPart, type SessionId } from "@liminal/sdk";
import { EntryKinds, SessionLog, UserEntry } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tools/contract";

import {
  type Answers,
  AnswersEntry,
  answersText,
  CancelledEntry,
  FormEntry,
  FormGone,
  QuestionsRpcs,
} from "./contract.ts";
import { makeAwaitForm, pendingOf, watchPending } from "./server/pending.ts";
import { askQuestion } from "./server/tool.ts";

/** Before inbox's hook, so steering input waits for the answers. */
const hookOrder = -5;

const REQUEST =
  "[qna] Ask me, with the ask_question tool, the questions you still need answered. Ask them again if you asked them already.";

const textPart = (text: string): ModelPart => ({ type: "text", text, providerData: {} });

const toolChange = (change: "offer" | "withdraw"): ModelPart => ({
  type: "tool-change",
  change,
  tool: askQuestion.spec,
});

/** `/qna`'s request: the user sees what they typed; the model reads the request and the offer. */
const requestDraft = (context: string) => {
  const shown = context === "" ? "/qna" : `/qna ${context}`;
  const request = context === "" ? REQUEST : `${REQUEST}\n\n${context}`;

  return {
    text: shown,
    draft: draft(UserEntry, {
      data: { text: shown },
      model: [{ role: "user", parts: [textPart(request), toolChange("offer")] }],
      text: shown,
    }),
  };
};

const answersDraft = (answers: Answers) => {
  const text = answersText(answers);

  return draft(AnswersEntry, {
    data: answers,
    model: [{ role: "user", parts: [textPart(text), toolChange("withdraw")] }],
    text,
  });
};

const cancelledDraft = (title: string) => {
  const text = `[qna] I cancelled the questions "${title}" without answering them.`;

  return draft(CancelledEntry, {
    data: { title },
    model: [{ role: "user", parts: [textPart(text), toolChange("withdraw")] }],
    text,
  });
};

const make = Effect.gen(function* () {
  const log = yield* SessionLog;
  const inbox = yield* Inbox;
  const kinds = yield* EntryKinds;
  // One answer or cancel at a time, so a form is closed once.
  const lock = yield* Semaphore.make(1);

  yield* kinds.register(FormEntry);
  yield* kinds.register(AnswersEntry);
  yield* kinds.register(CancelledEntry);
  yield* (yield* Tools).register(askQuestion);
  yield* (yield* BeforeCallHooks).register(makeAwaitForm(log), { order: hookOrder });

  /** Fails unless the form saved at `seq` still waits. */
  const waiting = Effect.fn("questions.waiting")(function* (session: SessionId, seq: number) {
    const pending = pendingOf(yield* log.read(session, {}));
    if (Predicate.isTagged(pending, "Asked") && pending.seq === seq) return pending.form;

    return yield* new FormGone({ seq });
  });

  return QuestionsRpcs.of({
    "questions/ask": ({ session, context }) =>
      inbox.sendDraft(session, requestDraft(context.trim()), "follow-up"),
    "questions/pending": ({ session }) =>
      watchPending(log, session).pipe(
        Stream.catch((error) =>
          Stream.fromEffect(Effect.logWarning(`questions ended: ${error.message}`)).pipe(
            Stream.drain,
          ),
        ),
      ),
    "questions/answer": ({ session, seq, answers }) =>
      lock.withPermit(
        waiting(session, seq).pipe(
          Effect.andThen(
            inbox.sendDraft(
              session,
              { text: `Answers to ${answers.title}`, draft: answersDraft(answers) },
              "follow-up",
            ),
          ),
        ),
      ),
    "questions/cancel": ({ session, seq }) =>
      lock.withPermit(
        waiting(session, seq).pipe(
          Effect.flatMap((form) => log.append(session, [cancelledDraft(form.title)])),
          Effect.asVoid,
        ),
      ),
  });
});

export const layer = QuestionsRpcs.toLayer(make);
