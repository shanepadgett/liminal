/**
 * The user's answers to `ask_question`, under its work row. Each question stays muted with the
 * answer under it in the user's voice, or `skipped` in faint text; `(suggested)` follows an answer
 * the model suggested. The user's note on their answer hangs under it, and their additional notes
 * close the list, answered like a question.
 */

import { Index, Show } from "solid-js";

import { useColor } from "../../theme/theme.tsx";
import { type Draft, isAnswered, optionsOf, type Question } from "../asks/form.ts";

export interface Answer {
  readonly prompt: string;
  /** What the user answered; none when they skipped the question. */
  readonly text: string | undefined;
  readonly isSuggested: boolean;
  /** The user's note on their answer, such as why they picked it. */
  readonly note: string;
}

const answerTextOf = (question: Question, draft: Draft): string | undefined => {
  if (!isAnswered(draft)) return undefined;
  if (draft.kind === "text") return draft.text;
  if (draft.picked === "own") return draft.own;

  return optionsOf(question)[draft.picked ?? 0]?.label;
};

/** Each question's answer, then the additional notes when the user wrote any. */
export const answersOf = (
  questions: readonly Question[],
  drafts: readonly Draft[],
  notes: string,
): readonly Answer[] => [
  ...questions.flatMap((question, index) => {
    const draft = drafts[index];

    if (draft === undefined) return [];

    const text = answerTextOf(question, draft);

    return [
      {
        prompt: question.prompt,
        text,
        isSuggested: text !== undefined && text === question.recommendation?.answer,
        note: draft.kind === "choice" && text !== undefined ? draft.note : "",
      },
    ];
  }),
  ...(notes.trim() === ""
    ? []
    : [{ prompt: "Additional notes", text: notes, isSuggested: false, note: "" }]),
];

function AnswerItem(props: { readonly answer: Answer }) {
  const color = useColor();

  return (
    <box>
      <text fg={color("text.muted")}>{props.answer.prompt}</text>
      <text>
        <span style={{ fg: color("text.accent") }}>{"→ "}</span>
        <span
          style={{ fg: color(props.answer.text === undefined ? "text.faint" : "text.heading") }}
        >
          {props.answer.text ?? "skipped"}
        </span>
        <span style={{ fg: color("text.faint") }}>
          {props.answer.isSuggested ? "  (suggested)" : ""}
        </span>
      </text>
      <Show when={props.answer.note !== ""}>
        <text>
          <span style={{ fg: color("text.ghost") }}>{"  └ "}</span>
          <span style={{ fg: color("text.muted") }}>{props.answer.note}</span>
        </text>
      </Show>
    </box>
  );
}

/** The answers, always open under the row behind a thin rule. */
export function Answers(props: { readonly answers: readonly Answer[] }) {
  const color = useColor();

  return (
    <box border={["left"]} borderColor={color("border.subtle")} paddingLeft={1} marginLeft={2}>
      <box gap={1}>
        <Index each={props.answers}>{(answer) => <AnswerItem answer={answer()} />}</Index>
      </box>
    </box>
  );
}
