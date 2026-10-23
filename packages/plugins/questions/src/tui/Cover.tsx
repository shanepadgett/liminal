/**
 * The cover in the composer's place while the running turn waits on asks: the oldest ask whose kind
 * has a view, drawn by that view. Each new ask draws afresh.
 */

import { Dynamic } from "@opentui/solid";
import { Effect, type Schema } from "effect";
import { createMemo, createSignal, onMount, Show } from "solid-js";

import type { CoverProps } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { useRun } from "@shanepadgett/liminal-tui";

import { QuestionsRpc } from "../contract.ts";
import { type AskedData, type AskView, type AskViews, openAsks } from "./asks.ts";

const sendAnswer = Effect.fn("questions.answer")(function* (
  session: CoverProps["session"],
  id: string,
  answer: Schema.Json,
) {
  const questions = yield* (yield* Host).client(QuestionsRpc);

  yield* questions["questions/answer"]({ session, id, answer });
}, Effect.scoped);

interface Shown {
  readonly ask: AskedData;
  readonly view: AskView["component"];
}

export function AskCover(props: CoverProps & { readonly views: AskViews["Service"] }) {
  const run = useRun();
  const [views, setViews] = createSignal<ReadonlyMap<string, AskView["component"]>>(new Map());
  const asks = () => openAsks(props.state);

  onMount(() => {
    run(
      Effect.map(props.views.list, (added) => {
        setViews(new Map(added.map((view) => [view.kind, view.component])));
      }),
    );
  });

  const shown = createMemo<Shown | undefined>(
    () =>
      asks().flatMap((ask) => {
        const view = views().get(ask.kind);

        return view === undefined ? [] : [{ ask, view }];
      })[0],
    undefined,
    { equals: (before, after) => before?.ask.id === after?.ask.id && before?.view === after?.view },
  );

  return (
    <Show when={shown()} keyed>
      {({ ask, view }) => (
        <Dynamic
          component={view}
          ask={ask}
          session={props.session}
          more={asks().length - 1}
          answer={(answer: Schema.Json) => {
            run(sendAnswer(props.session, ask.id, answer));
          }}
          cancel={props.cancel}
        />
      )}
    </Show>
  );
}
