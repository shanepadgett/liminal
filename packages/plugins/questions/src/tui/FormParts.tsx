/** The parts of `ask_question`'s form: its tabs and the tab in view. */

import { Index, Match, Show, Switch } from "solid-js";

import type { RoleName } from "@shanepadgett/liminal-client";
import { kit, useColor } from "@shanepadgett/liminal-tui";

import { optionsOf, type Question, type Recommendation } from "../contract.ts";
import { Field, Note } from "./Ask.tsx";
import {
  type Draft,
  type FormState,
  isAnswered,
  setNote,
  setNotes,
  setOwn,
  setText,
} from "./form-state.ts";

type Choice = Extract<Draft, { kind: "choice" }>;

type Update = (change: (state: FormState) => FormState) => void;

const OWN_PLACEHOLDER = "Other…";

export function Tabs(props: { readonly state: FormState }) {
  const color = useColor();

  const labels = () => [
    ...props.state.drafts.map((draft, index) => ({
      text: `${index + 1}`,
      isDone: isAnswered(draft),
    })),
    { text: "notes", isDone: props.state.notes.trim() !== "" },
  ];

  return (
    <box flexDirection="row" height={1} marginLeft={-1}>
      <Index each={labels()}>
        {(label, index) => {
          const isCurrent = () => index === props.state.tab;

          const role = (): RoleName => {
            if (isCurrent()) return "text.heading";

            return label().isDone ? "text.muted" : "text.faint";
          };

          return (
            <text flexShrink={0} bg={isCurrent() ? color("surface.selected") : "transparent"}>
              <span style={{ fg: color(role()) }}>{` ${label().text}`}</span>
              <span style={{ fg: color("feedback.success") }}>{label().isDone ? " ✓" : ""}</span>
              <span> </span>
            </text>
          );
        }}
      </Index>
    </box>
  );
}

function Suggested(props: { readonly recommendation: Recommendation }) {
  const color = useColor();

  return (
    <box flexDirection="row" marginTop={1}>
      <text flexShrink={0} fg={color("text.ghost")}>
        {"suggested  "}
      </text>
      <box flexShrink={1}>
        <text fg={color("text.accent")}>{props.recommendation.answer}</text>
        <text fg={color("text.faint")}>{props.recommendation.reason}</text>
      </box>
    </box>
  );
}

/** The row for the user's own answer: a field under the cursor, else what they wrote. */
function OwnRow(props: {
  readonly draft: Choice;
  readonly isUnder: boolean;
  readonly update: Update;
}) {
  const color = useColor();
  const pick = () => (props.draft.picked === "own" ? "picked" : "unpicked");

  return (
    <kit.ChoiceRow label="" labelColumns={0} isUnder={props.isUnder} pick={pick()}>
      <Show
        when={props.isUnder}
        fallback={
          <text fg={color(props.draft.own === "" ? "text.faint" : "text.base")}>
            {props.draft.own === "" ? OWN_PLACEHOLDER : props.draft.own}
          </text>
        }
      >
        <Field
          value={props.draft.own}
          placeholder={OWN_PLACEHOLDER}
          onInput={(own) => {
            props.update((each) => setOwn(each, own));
          }}
        />
      </Show>
    </kit.ChoiceRow>
  );
}

function ChoiceTab(props: {
  readonly state: FormState;
  readonly question: Question;
  readonly draft: Choice;
  readonly update: Update;
}) {
  const options = () => optionsOf(props.question);
  const columns = () => kit.labelColumnsOf(options().map((option) => option.label));
  const isPicked = (index: number) => props.draft.picked === index;

  return (
    <box marginTop={1}>
      <Index each={options()}>
        {(option, index) => (
          <>
            <kit.ChoiceRow
              label={option().label}
              detail={option().description}
              labelColumns={columns()}
              isUnder={index === props.state.row}
              pick={isPicked(index) ? "picked" : "unpicked"}
            />
            <Note
              note={isPicked(index) ? (props.state.noting ?? props.draft.note) : undefined}
              isWriting={props.state.noting !== undefined && isPicked(index)}
              placeholder="Why this answer"
              indent={kit.POINTER_COLUMNS + kit.RING_COLUMNS}
              onInput={(text) => {
                props.update((each) => setNote(each, text));
              }}
            />
          </>
        )}
      </Index>
      <Show when={props.question.kind === "select"}>
        <OwnRow
          draft={props.draft}
          isUnder={props.state.row === options().length}
          update={props.update}
        />
      </Show>
    </box>
  );
}

/** A field for a written answer or the additional notes, after the composer's chevron. */
function WriteField(props: {
  readonly text: string;
  readonly placeholder: string;
  readonly onInput: (text: string) => void;
}) {
  return (
    <box marginTop={1}>
      <kit.ChoiceRow label="" labelColumns={0} isUnder>
        <Field value={props.text} placeholder={props.placeholder} onInput={props.onInput} />
      </kit.ChoiceRow>
    </box>
  );
}

function QuestionTab(props: {
  readonly state: FormState;
  readonly question: Question;
  readonly draft: Draft;
  readonly update: Update;
}) {
  const color = useColor();
  const choice = () => (props.draft.kind === "choice" ? props.draft : undefined);
  const written = () => (props.draft.kind === "text" ? props.draft : undefined);

  return (
    <>
      <text fg={color("text.base")}>{props.question.prompt}</text>
      <Switch>
        <Match when={choice()}>
          {(picking) => (
            <ChoiceTab
              state={props.state}
              question={props.question}
              draft={picking()}
              update={props.update}
            />
          )}
        </Match>
        <Match when={written()}>
          {(writing) => (
            <WriteField
              text={writing().text}
              placeholder="Your answer"
              onInput={(text) => {
                props.update((each) => setText(each, text));
              }}
            />
          )}
        </Match>
      </Switch>
      <Show when={props.question.recommendation}>
        {(recommendation) => <Suggested recommendation={recommendation()} />}
      </Show>
    </>
  );
}

function NotesTab(props: { readonly notes: string; readonly update: Update }) {
  const color = useColor();

  return (
    <>
      <text>
        <span style={{ fg: color("text.base") }}>Anything else the model should know?</span>
        <span style={{ fg: color("text.faint") }}>{"  optional"}</span>
      </text>
      <WriteField
        text={props.notes}
        placeholder="Additional notes"
        onInput={(notes) => {
          props.update((each) => setNotes(each, notes));
        }}
      />
    </>
  );
}

/** The tab in view: a question, or the closing notes tab. */
export function FormBody(props: { readonly state: FormState; readonly update: Update }) {
  const question = () => props.state.form.questions.at(props.state.tab);
  const draft = () => props.state.drafts.at(props.state.tab);

  return (
    <Show when={question()} fallback={<NotesTab notes={props.state.notes} update={props.update} />}>
      {(asked) => (
        <Show when={draft()}>
          {(given) => (
            <QuestionTab
              state={props.state}
              question={asked()}
              draft={given()}
              update={props.update}
            />
          )}
        </Show>
      )}
    </Show>
  );
}
