/**
 * Questions' `tui` entry. While the running turn waits on asks, the oldest takes the composer's
 * place, drawn by its kind's view in `AskViews`; `ask_question`'s form is one. `ask_question`'s row
 * shows the user's answers under it. While an ask waits, Porter waits patiently and the header
 * holds still. `/qna`, alone or before text in the draft, asks the model to ask its open questions;
 * it runs only while no turn runs.
 */
import { Effect, Layer } from "effect";

import {
  ChatScreen,
  ComposerCovers,
  type Mood,
  Moods,
  ToolRows,
  ToolRowView,
  turnBlocked,
} from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin, Registry } from "@shanepadgett/liminal-core";
import type { SessionId } from "@shanepadgett/liminal-session/contract";
import {
  Dialogs,
  Keymap,
  type kit,
  makeEntryRun,
  Notifications,
  Pickers,
  registerCommands,
} from "@shanepadgett/liminal-tui";

import { askQuestionName, formQuestion, QuestionsRpc } from "../contract.ts";
import { AskRow } from "./AskRow.tsx";
import { type AskView, AskViews, openAsks } from "./asks.ts";
import { AskCover } from "./Cover.tsx";
import { FormAsk } from "./FormAsk.tsx";

export { Ask, Field, moreAside, Note } from "./Ask.tsx";
export { type AskedData, type AskProps, type AskView, AskViews } from "./asks.ts";

/** Long, slow blinks and a doze: nothing to do but wait for the user. */
const waitingPoses: ReadonlyArray<kit.Pose> = [
  { face: "( •_• )", weight: 4, hold: [40, 90] },
  { face: "( -_- )", weight: 3, hold: [6, 10] },
  { face: "( -.- )", weight: 2, hold: [30, 70] },
  { face: "( •ᴗ• )", weight: 1, hold: [12, 24] },
];

const waiting: Mood = {
  active: (props) => openAsks(props.state).length > 0,
  words: () => ["patiently waiting", "waiting for you", "all ears"],
  poses: waitingPoses,
  header: "still",
};

const make = Effect.gen(function* () {
  const host = yield* Host;
  const chat = yield* ChatScreen;
  const views = yield* AskViews;
  const run = yield* makeEntryRun("Questions failed.");

  const qna = (session: SessionId, text: string) =>
    Effect.scoped(
      Effect.flatMap(host.client(QuestionsRpc), (questions) =>
        questions["questions/qna"]({ session, text }),
      ),
    );

  yield* views.add({ kind: formQuestion.kind, component: FormAsk });
  yield* (yield* ToolRows).add(ToolRowView.Shown({ tool: askQuestionName, component: AskRow }));

  yield* (yield* ComposerCovers).add({
    active: (props) => openAsks(props.state).length > 0,
    component: (props) => <AskCover {...props} views={views} />,
  });

  yield* (yield* Moods).add(waiting);

  yield* registerCommands([
    {
      name: "questions.qna",
      title: "Ask me your questions",
      category: "Session",
      slash: { name: "qna" },
      argument: { kind: "optional", hint: "topic" },
      enabled: () => chat.session() !== undefined,
      blocked: turnBlocked(chat, "qna"),
      run: (text) => {
        const session = chat.session();
        if (session !== undefined) run(qna(session, text));
      },
    },
  ]);
});

export default definePlugin({
  name: "questions-tui",
  provides: [AskViews],
  requires: [
    Host,
    Dialogs,
    Pickers,
    Keymap,
    Notifications,
    ChatScreen,
    ComposerCovers,
    ToolRows,
    Moods,
  ],
  layer: Layer.effectDiscard(make).pipe(
    Layer.provideMerge(Layer.effect(AskViews, Registry.make<AskView>())),
  ),
});
