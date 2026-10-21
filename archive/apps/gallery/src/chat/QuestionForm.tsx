/**
 * The composer taken over by the assistant's questions: the form's title, its tabs, and the tab in
 * view, a question to choose or write an answer for, or additional context. Any question left open
 * is sent as skipped.
 */

import { Show } from "solid-js";

import type { Question } from "@liminal/questions/contract";
import type { RoleColor } from "@liminal/sdk/tui";

import { ChoiceTab } from "./ChoiceTab.tsx";
import type { Draft, FormState } from "./formState.ts";
import { FormTabs } from "./FormTabs.tsx";
import { WriteTab } from "./WriteTab.tsx";

function QuestionTab(props: {
  readonly color: RoleColor;
  readonly form: FormState;
  readonly question: Question;
  readonly draft: Draft;
}) {
  const choice = () => (props.draft.kind === "choice" ? props.draft : undefined);
  const written = () => (props.draft.kind === "text" ? props.draft : undefined);

  return (
    <>
      <Show when={choice()}>
        {(picking) => (
          <ChoiceTab
            color={props.color}
            question={props.question}
            draft={picking()}
            row={props.form.row}
            noting={props.form.noting}
          />
        )}
      </Show>
      <Show when={written()}>
        {(writing) => (
          <WriteTab
            color={props.color}
            prompt={props.question.prompt}
            aside=""
            recommendation={props.question.recommendation}
            text={writing().text}
            placeholder="Your answer"
          />
        )}
      </Show>
    </>
  );
}

export function QuestionForm(props: { readonly color: RoleColor; readonly form: FormState }) {
  const question = () => props.form.questions.at(props.form.tab);
  const draft = () => props.form.drafts.at(props.form.tab);

  return (
    <box flexDirection="column">
      <text wrapMode="none" truncate fg={props.color("text.heading")}>
        {props.form.title}
      </text>
      <box marginTop={1}>
        <FormTabs color={props.color} form={props.form} />
      </box>
      <box flexDirection="column" marginTop={1}>
        <Show
          when={question()}
          fallback={
            <WriteTab
              color={props.color}
              prompt="Anything else the assistant should know?"
              aside="optional"
              recommendation={undefined}
              text={props.form.context}
              placeholder="Additional context"
            />
          }
        >
          {(asked) => (
            <Show when={draft()}>
              {(given) => (
                <QuestionTab
                  color={props.color}
                  form={props.form}
                  question={asked()}
                  draft={given()}
                />
              )}
            </Show>
          )}
        </Show>
      </box>
    </box>
  );
}
