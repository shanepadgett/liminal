/**
 * The model's questions, as a form in the draft's place: the form's title, a tab per question and a
 * last one for additional notes, then the tab in view. A question with options lists them as rows
 * to pick; the user's note on the option they picked hangs under it, and a select question ends in
 * a row for the user's own answer. A written question and the additional notes tab are a field. The
 * answer the model suggests closes the tab.
 */

import { Index, Match, Show, Switch } from "solid-js";

import {
  ChoiceRow,
  labelColumnsOf,
  POINTER_COLUMNS,
  RING_COLUMNS,
} from "../../primitives/ChoiceRow.tsx";
import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";
import { Ask, Field, Note } from "./Ask.tsx";
import {
  type Draft,
  type Form,
  isAnswered,
  optionsOf,
  type Question,
  type Recommendation,
} from "./form.ts";

type Choice = Extract<Draft, { kind: "choice" }>;

const OWN_PLACEHOLDER = "Other…";

function Tabs(props: { readonly form: Form }) {
  const color = useColor();

  const labels = () => [
    ...props.form.drafts.map((draft, index) => ({
      text: `${index + 1}`,
      isDone: isAnswered(draft),
    })),
    { text: "notes", isDone: props.form.additionalNotes.trim() !== "" },
  ];

  return (
    <box flexDirection="row" height={1} marginLeft={-1}>
      <Index each={labels()}>
        {(label, index) => {
          const isCurrent = () => index === props.form.tab;

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
function OwnRow(props: { readonly draft: Choice; readonly isUnder: boolean }) {
  const color = useColor();
  const pick = () => (props.draft.picked === "own" ? "picked" : "unpicked");

  return (
    <ChoiceRow label="" labelColumns={0} isUnder={props.isUnder} pick={pick()}>
      <Show
        when={props.isUnder}
        fallback={
          <text fg={color(props.draft.own === "" ? "text.faint" : "text.base")}>
            {props.draft.own === "" ? OWN_PLACEHOLDER : props.draft.own}
          </text>
        }
      >
        <Field value={props.draft.own} placeholder={OWN_PLACEHOLDER} />
      </Show>
    </ChoiceRow>
  );
}

function ChoiceTab(props: {
  readonly question: Question;
  readonly draft: Choice;
  readonly row: number;
  readonly isNoting: boolean;
}) {
  const options = () => optionsOf(props.question);
  const columns = () => labelColumnsOf(options().map((option) => option.label));

  return (
    <box marginTop={1}>
      <Index each={options()}>
        {(option, index) => (
          <>
            <ChoiceRow
              label={option().label}
              detail={option().description}
              labelColumns={columns()}
              isUnder={index === props.row}
              pick={props.draft.picked === index ? "picked" : "unpicked"}
            />
            <Note
              note={props.draft.picked === index ? props.draft.note : undefined}
              isWriting={props.isNoting && props.draft.picked === index}
              placeholder="Why this answer"
              indent={POINTER_COLUMNS + RING_COLUMNS}
            />
          </>
        )}
      </Index>
      <Show when={props.question.kind === "select"}>
        <OwnRow draft={props.draft} isUnder={props.row === options().length} />
      </Show>
    </box>
  );
}

/** A field for a written answer or the additional notes, after the composer's chevron. */
function WriteField(props: { readonly text: string; readonly placeholder: string }) {
  return (
    <box marginTop={1}>
      <ChoiceRow label="" labelColumns={0} isUnder>
        <Field value={props.text} placeholder={props.placeholder} />
      </ChoiceRow>
    </box>
  );
}

function QuestionTab(props: {
  readonly form: Form;
  readonly question: Question;
  readonly draft: Draft;
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
              question={props.question}
              draft={picking()}
              row={props.form.row}
              isNoting={props.form.isNoting === true}
            />
          )}
        </Match>
        <Match when={written()}>
          {(writing) => <WriteField text={writing().text} placeholder="Your answer" />}
        </Match>
      </Switch>
      <Show when={props.question.recommendation}>
        {(recommendation) => <Suggested recommendation={recommendation()} />}
      </Show>
    </>
  );
}

function AdditionalNotesTab(props: { readonly notes: string }) {
  const color = useColor();

  return (
    <>
      <text>
        <span style={{ fg: color("text.base") }}>Anything else the model should know?</span>
        <span style={{ fg: color("text.faint") }}>{"  optional"}</span>
      </text>
      <WriteField text={props.notes} placeholder="Additional notes" />
    </>
  );
}

export function Questions(props: { readonly form: Form }) {
  const question = () => props.form.questions.at(props.form.tab);
  const draft = () => props.form.drafts.at(props.form.tab);

  return (
    <Ask mark="?" markRole="text.accent" title={props.form.title}>
      <Tabs form={props.form} />
      <box marginTop={1}>
        <Show
          when={question()}
          fallback={<AdditionalNotesTab notes={props.form.additionalNotes} />}
        >
          {(asked) => (
            <Show when={draft()}>
              {(given) => <QuestionTab form={props.form} question={asked()} draft={given()} />}
            </Show>
          )}
        </Show>
      </box>
    </Ask>
  );
}
