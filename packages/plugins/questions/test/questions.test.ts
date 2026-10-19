/**
 * `/qna` on the scripted provider: the request offers `ask_question`, its call ends the turn with a
 * form, and answering or cancelling closes it.
 */

import { describe, expect, test } from "bun:test";

import { Effect, Fiber, Layer, Option, Predicate, Stream } from "effect";
import { RpcTest } from "effect/rpc";
import { TestClock } from "effect/testing";

import agentLoop from "@liminal/agent-loop";
import context from "@liminal/context";
import inbox from "@liminal/inbox";
import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import {
  reply,
  replyText,
  ScriptedModel,
  scriptedProvider,
} from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import { type ModelPart, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, TurnEndedEntry } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";
import { Settings } from "@liminal/settings/contract";
import tools from "@liminal/tools";

import questions from "../plugin.ts";
import {
  type Answers,
  AnswersEntry,
  askQuestionTool,
  CancelledEntry,
  type Form,
  FormEntry,
  type Question,
  QuestionsRpcs,
} from "../src/contract.ts";
import { formProblem } from "../src/server/tool.ts";
import {
  answersOf,
  formState,
  moveRow,
  moveTab,
  pick,
  saveNote,
  setNote,
  startNote,
} from "../src/tui/form.ts";

const stack = serverOf(questions).pipe(
  Layer.provideMerge(serverOf(inbox)),
  Layer.provideMerge(serverOf(agentLoop)),
  Layer.provideMerge(serverOf(tools)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(modelScripted)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(serverOf(modelCatalog)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(serverOf(settingsPlugin)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

const store: Question = {
  kind: "select",
  id: "store",
  prompt: "Where should sessions live?",
  options: [{ label: "SQLite" }, { label: "Files", description: "One JSON file each" }],
  recommendation: { answer: "SQLite", reason: "One file to back up" },
};

const keep: Question = { kind: "confirm", id: "keep", prompt: "Keep old sessions?" };

const name: Question = { kind: "input", id: "name", prompt: "What should the folder be called?" };

const form: Form = { title: "Storage", questions: [store, keep, name] };

const askCall: ModelPart = {
  type: "tool-call",
  id: "c1",
  name: askQuestionTool,
  params: form,
  providerData: {},
};

const setUp = Effect.gen(function* () {
  yield* (yield* SessionLog).create(s1);

  yield* (yield* Settings).write("global", ["agent-loop", "model"], {
    provider: scriptedProvider,
    id: "scripted",
  });
});

/** Advances the clock until `done` holds. */
const until = Effect.fn("until")(function* <E, R>(done: Effect.Effect<boolean, E, R>) {
  for (let tries = 0; tries < 200; tries += 1) {
    if (yield* done) return yield* Effect.void;
    yield* TestClock.adjust("10 millis");
  }

  return yield* Effect.die("the condition never held");
});

const readAll = Effect.flatMap(SessionLog, (log) => log.read(s1, {}));

const endedTimes = (count: number) =>
  Effect.map(
    readAll,
    (entries) => entries.filter((entry) => entry.kind === TurnEndedEntry.kind).length >= count,
  );

const kinds = readAll.pipe(Effect.map((entries) => entries.map((entry) => entry.kind)));

const changesOf = (parts: ReadonlyArray<ModelPart>) =>
  parts.flatMap((part) => (part.type === "tool-change" ? [part.change] : []));

/** Runs `/qna`, and the model's reply puts the form up. */
const asked = Effect.gen(function* () {
  yield* setUp;
  yield* (yield* ScriptedModel).enqueue(reply([askCall], { reason: "tool-calls" }));
  const client = yield* RpcTest.makeClient(QuestionsRpcs);
  yield* client["questions/ask"]({ session: s1, context: "about storage" });
  yield* until(endedTimes(1));

  return client;
});

effectTest(
  "the request offers ask_question, and its call ends the turn with the form waiting",
  Effect.gen(function* () {
    const client = yield* asked;
    const scripted = yield* ScriptedModel;
    const [request] = yield* scripted.requests;

    const tool = request?.tools.find((each) => each.name === askQuestionTool);
    expect(tool?.offered).toBe(false);
    expect(changesOf(request?.messages.at(-1)?.parts ?? [])).toEqual(["offer"]);
    expect(yield* scripted.requests).toHaveLength(1);
    expect((yield* kinds).at(-2)).toBe(FormEntry.kind);

    const pending = yield* client["questions/pending"]({ session: s1 }).pipe(
      Stream.take(1),
      Stream.runHead,
    );

    expect(Option.map(pending, (each) => Predicate.isTagged(each, "Asked") && each.seq)).toEqual(
      Option.some(expect.any(Number)),
    );
  }),
  stack,
);

const answers: Answers = {
  title: "Storage",
  answered: [
    { question: store, answer: { kind: "picked", option: "SQLite", notes: [] } },
    { question: keep, answer: { kind: "skipped" } },
    { question: name, answer: { kind: "written", text: "sessions" } },
  ],
  context: "",
};

const askedSeq = readAll.pipe(
  Effect.map((entries) => entries.find((entry) => entry.kind === FormEntry.kind)?.seq ?? -1),
);

effectTest(
  "answers start the next turn, which withdraws the tool",
  Effect.gen(function* () {
    const client = yield* asked;
    const scripted = yield* ScriptedModel;
    yield* scripted.enqueue(replyText("thanks"));
    const seq = yield* askedSeq;

    const watching = yield* client["questions/pending"]({ session: s1 }).pipe(
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    );

    yield* client["questions/answer"]({ session: s1, seq, answers });
    yield* until(endedTimes(2));

    const [, second] = yield* scripted.requests;
    const last = second?.messages.at(-1);
    expect(changesOf(last?.parts ?? [])).toEqual(["withdraw"]);
    expect(yield* kinds).toContain(AnswersEntry.kind);

    const seen = yield* Fiber.join(watching);
    expect(seen.map((each) => Predicate.isTagged(each, "Asked"))).toEqual([true, false]);

    const again = yield* Effect.flip(client["questions/answer"]({ session: s1, seq, answers }));
    expect(Predicate.isTagged(again, "FormGone")).toBe(true);
  }),
  stack,
);

effectTest(
  "a cancel closes the form without a turn",
  Effect.gen(function* () {
    const client = yield* asked;
    const seq = yield* askedSeq;

    yield* client["questions/cancel"]({ session: s1, seq });

    expect((yield* kinds).at(-1)).toBe(CancelledEntry.kind);
    expect(yield* (yield* ScriptedModel).requests).toHaveLength(1);

    const pending = yield* client["questions/pending"]({ session: s1 }).pipe(Stream.runHead);

    expect(Option.map(pending, (each) => Predicate.isTagged(each, "NoForm"))).toEqual(
      Option.some(true),
    );
  }),
  stack,
);

describe("formProblem", () => {
  test("rejects repeated ids and a recommendation that is not an option", () => {
    expect(formProblem({ title: "t", questions: [store, store] })).toContain("Two questions");

    expect(
      formProblem({
        title: "t",
        questions: [
          {
            kind: "confirm",
            id: "a",
            prompt: "?",
            recommendation: { answer: "Maybe", reason: "r" },
          },
        ],
      }),
    ).toContain("not one of its options");

    expect(formProblem(form)).toBeUndefined();
  });
});

describe("form state", () => {
  test("picks, notes, writes and skips", () => {
    let state = formState(form);
    state = startNote(moveRow(state, 1));
    state = saveNote(setNote(state, "simpler"));
    state = pick(moveRow(state, -1));
    expect(state.tab).toBe(1);

    state = moveTab(state, 2);
    expect(state.tab).toBe(3);

    expect(answersOf(state).answered.map((each) => each.answer)).toEqual([
      { kind: "picked", option: "SQLite", notes: [{ option: "Files", text: "simpler" }] },
      { kind: "skipped" },
      { kind: "skipped" },
    ]);
  });
});
