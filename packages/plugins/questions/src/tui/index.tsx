/**
 * Questions' `tui` entry. While the running turn waits on asks, the oldest takes the composer's
 * place, drawn by its kind's view in `AskViews`; `ask_question`'s form is one. `ask_question`'s row
 * shows the user's answers under it. While an ask waits, Porter waits patiently and the header
 * holds still. `/qna`, alone or before text in the draft, asks the model to ask its open
 * questions.
 */
import { Effect, Layer, Option } from "effect";

import {
  ChatScreen,
  ChatSend,
  ComposerCovers,
  type Mood,
  Moods,
  ToolRows,
} from "@shanepadgett/liminal-chat/tui";
import { draftTextOf } from "@shanepadgett/liminal-chat/view";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin, Registry } from "@shanepadgett/liminal-core";
import type { SessionId } from "@shanepadgett/liminal-session/contract";
import {
  Dialogs,
  Keymap,
  type kit,
  makeEntryRun,
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

const QNA = /^\/qna(?:\s+|$)/u;

/** The text after `/qna` when the draft starts with it. */
const qnaTextOf = (text: string): Option.Option<string> =>
  QNA.test(text) ? Option.some(text.replace(QNA, "")) : Option.none();

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
  yield* (yield* ToolRows).add({ tool: askQuestionName, component: AskRow });

  yield* (yield* ComposerCovers).add({
    active: (props) => openAsks(props.state).length > 0,
    component: (props) => <AskCover {...props} views={views} />,
  });

  yield* (yield* Moods).add(waiting);

  yield* (yield* ChatSend).wrap((request, next) =>
    Option.match(Option.flatMap(draftTextOf(request.input), qnaTextOf), {
      onNone: () => next(request),
      onSome: (text) => qna(request.session, text),
    }),
  );

  yield* registerCommands([
    {
      name: "questions.qna",
      title: "Ask me your questions",
      category: "Session",
      slash: { name: "qna" },
      enabled: () => chat.session() !== undefined,
      run: () => {
        const session = chat.session();
        if (session !== undefined) run(qna(session, ""));
      },
    },
  ]);
});

export default definePlugin({
  name: "questions-tui",
  provides: [AskViews],
  requires: [Host, Dialogs, Pickers, Keymap, ChatScreen, ChatSend, ComposerCovers, ToolRows, Moods],
  layer: Layer.effectDiscard(make).pipe(
    Layer.provideMerge(Layer.effect(AskViews, Registry.make<AskView>())),
  ),
});
