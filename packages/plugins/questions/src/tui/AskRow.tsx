/**
 * `ask_question`'s row: the plain work row with the form's title and how it was answered. Once the
 * user answers, a click on the row opens their answers under it behind a thin rule. Each question
 * stays muted with the answer under it in the user's voice, or `skipped` in faint text;
 * `(suggested)` follows an answer the model suggested. The user's note on their answer hangs under
 * it, and their additional notes close the list, answered like a question.
 */

import { Option, Predicate, Schema } from "effect";
import { createMemo, Index, Show } from "solid-js";

import { type ToolRowProps, WorkRow } from "@shanepadgett/liminal-chat/tui";
import { useColor } from "@shanepadgett/liminal-tui";

import { Answered, Asked } from "../contract.ts";
import {
  type Answers,
  answerTextOf,
  type Form,
  formQuestion,
  isSuggested,
  noteOf,
} from "../contract.ts";

interface AnswerLine {
  readonly prompt: string;
  /** What the user answered; none when they skipped the question. */
  readonly text: string | undefined;
  readonly isSuggested: boolean;
  readonly note: string;
}

const decodeForm = Schema.decodeOption(formQuestion.data);

const decodeAnswers = Schema.decodeOption(formQuestion.answer);

/** Each question's answer, then the additional notes when the user wrote any. */
const linesOf = (form: Form, { answers, notes }: Answers): ReadonlyArray<AnswerLine> => [
  ...form.questions.map((question, index) => {
    const answer = answers[index] ?? { kind: "skipped" };

    return {
      prompt: question.prompt,
      text: answerTextOf(answer),
      isSuggested: isSuggested(question, answer),
      note: noteOf(answer),
    };
  }),
  ...(notes === ""
    ? []
    : [{ prompt: "Additional notes", text: notes, isSuggested: false, note: "" }]),
];

/** How the form was answered, such as `3 answered, 1 skipped`. */
const summaryOf = ({ answers }: Answers) => {
  const skipped = answers.filter((answer) => answer.kind === "skipped").length;
  const answered = `${answers.length - skipped} answered`;

  return skipped === 0 ? answered : `${answered}, ${skipped} skipped`;
};

/** The user's answers to the ask `id`, once they come. */
const answersOf = (props: ToolRowProps, id: string) =>
  props.state.events.flatMap((event) =>
    Answered.decodeOption(event).pipe(
      Option.filter((answer) => answer.id === id),
      Option.flatMap((answer) => decodeAnswers(answer.answer)),
      Option.toArray,
    ),
  )[0];

/** The call's form and the user's answers, from the events that ask and answer it. */
const askOf = (props: ToolRowProps) =>
  props.state.events.flatMap((event) =>
    Asked.decodeOption(event).pipe(
      Option.filter((ask) => ask.callId === props.item.id),
      Option.map((ask) => ({
        form: Option.getOrUndefined(decodeForm(ask.data)),
        answers: answersOf(props, ask.id),
      })),
      Option.toArray,
    ),
  )[0];

/** The title as the model writes it, before the ask is logged. */
const writtenTitle = (params: ToolRowProps["item"]["params"]) =>
  Predicate.isObject(params) && "title" in params && Predicate.isString(params["title"])
    ? params["title"]
    : "";

function AnswerItem(props: { readonly line: AnswerLine }) {
  const color = useColor();

  return (
    <box>
      <text fg={color("text.muted")}>{props.line.prompt}</text>
      <text>
        <span style={{ fg: color("text.accent") }}>{"→ "}</span>
        <span style={{ fg: color(props.line.text === undefined ? "text.faint" : "text.heading") }}>
          {props.line.text ?? "skipped"}
        </span>
        <span style={{ fg: color("text.faint") }}>
          {props.line.isSuggested ? "  (suggested)" : ""}
        </span>
      </text>
      <Show when={props.line.note !== ""}>
        <text>
          <span style={{ fg: color("text.ghost") }}>{"  └ "}</span>
          <span style={{ fg: color("text.muted") }}>{props.line.note}</span>
        </text>
      </Show>
    </box>
  );
}

function AnswerList(props: { readonly lines: ReadonlyArray<AnswerLine> }) {
  const color = useColor();

  return (
    <box border={["left"]} borderColor={color("border.subtle")} paddingLeft={1} marginLeft={2}>
      <box gap={1}>
        <Index each={props.lines}>{(line) => <AnswerItem line={line()} />}</Index>
      </box>
    </box>
  );
}

export function AskRow(props: ToolRowProps) {
  const ask = createMemo(() => askOf(props));

  // A call the model is still writing, or one that failed before it asked, has no status.
  const status = () => {
    const found = ask();
    if (found === undefined) return "";
    if (found.answers !== undefined) return summaryOf(found.answers);

    return props.item.status === "running" ? "waiting for you" : "cancelled";
  };

  const title = () => ask()?.form?.title ?? writtenTitle(props.item.params);

  const lines = () => {
    const form = ask()?.form;
    const answers = ask()?.answers;

    return form === undefined || answers === undefined ? undefined : linesOf(form, answers);
  };

  // A fresh list each time the row opens; the answers do not change once they come.
  const answersShown = () => {
    const shown = lines();

    return shown === undefined ? undefined : () => <AnswerList lines={shown} />;
  };

  return (
    <WorkRow
      item={{ ...props.item, name: "ask", params: { title: `${title()}  ${status()}`.trim() } }}
      details={answersShown()}
    />
  );
}
