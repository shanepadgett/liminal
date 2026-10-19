/**
 * The questions' entries in the transcript. A form the turn left reads as one line: its title and
 * how many questions it holds. The user's answers are a raised band with the accent bar, like
 * anything else they send: each question muted with the answer under it, or `skipped`, what sets
 * the answer apart, the suggested answer when the user chose another, their notes, and any added
 * context. A click folds the band to its title line.
 */

import { Option, Schema } from "effect";
import { createSignal, Index, Show } from "solid-js";

import type { SavedEntry } from "@liminal/sdk";
import { EDGE_BAR, useColor } from "@liminal/sdk/tui";

import {
  type Answered,
  Answers,
  answerTextOf,
  Form,
  notesOf,
  passedOverOf,
  tagsOf,
} from "../contract.ts";

const decodeForm = Schema.decodeUnknownOption(Form);

const decodeAnswers = Schema.decodeUnknownOption(Answers);

/** The question numbers' column, so prompts that wrap stay clear of them. */
const NUMBER_WIDTH = 3;

const plural = (count: number) => (count === 1 ? "question" : "questions");

export function AskedRow(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  return (
    <Show
      when={Option.getOrUndefined(decodeForm(props.entry.data))}
      fallback={<text fg={color("text.base")}>{props.entry.text}</text>}
    >
      {(form) => (
        <text>
          <span style={{ fg: color("text.accent") }}>{"? "}</span>
          <span style={{ fg: color("text.base") }}>{form().title}</span>
          <span style={{ fg: color("text.ghost") }}>
            {`  ${form().questions.length} ${plural(form().questions.length)} for you`}
          </span>
        </text>
      )}
    </Show>
  );
}

function AnswerItem(props: { readonly answered: Answered; readonly number: number }) {
  const color = useColor();
  const tags = () => tagsOf(props.answered);
  const isSkipped = () => props.answered.answer.kind === "skipped";

  return (
    <box flexDirection="row" marginTop={1}>
      <text width={NUMBER_WIDTH} flexShrink={0} fg={color("text.faint")}>
        {`${props.number}`}
      </text>
      <box flexDirection="column" flexGrow={1} flexShrink={1}>
        <text fg={color("text.muted")}>{props.answered.question.prompt}</text>
        <text>
          <span style={{ fg: color("text.accent") }}>{"→ "}</span>
          <span style={{ fg: color(isSkipped() ? "text.faint" : "text.heading") }}>
            {answerTextOf(props.answered.answer)}
          </span>
          <span style={{ fg: color("text.ghost") }}>{tags() === "" ? "" : `  ${tags()}`}</span>
        </text>
        <Show when={passedOverOf(props.answered)}>
          {(suggested) => <text fg={color("text.ghost")}>{`  suggested ${suggested()}`}</text>}
        </Show>
        <Index each={notesOf(props.answered.answer)}>
          {(note) => (
            <text>
              <span style={{ fg: color("text.ghost") }}>{`  └ note on ${note().option}  `}</span>
              <span style={{ fg: color("text.muted") }}>{note().text}</span>
            </text>
          )}
        </Index>
      </box>
    </box>
  );
}

function AnswersBody(props: { readonly answers: Answers }) {
  const color = useColor();

  return (
    <>
      <Index each={props.answers.answered}>
        {(answered, index) => <AnswerItem answered={answered()} number={index + 1} />}
      </Index>
      <Show when={props.answers.context !== ""}>
        <box flexDirection="row" marginTop={1}>
          <text width={NUMBER_WIDTH} flexShrink={0} fg={color("text.faint")}>
            +
          </text>
          <box flexDirection="column" flexGrow={1} flexShrink={1}>
            <text fg={color("text.muted")}>Additional context</text>
            <text fg={color("text.heading")}>{props.answers.context}</text>
          </box>
        </box>
      </Show>
    </>
  );
}

function AnswersBand(props: { readonly answers: Answers }) {
  const color = useColor();
  const [isFolded, setFolded] = createSignal(false);

  return (
    <box
      flexDirection="column"
      border={["left"]}
      customBorderChars={EDGE_BAR}
      borderColor={color("border.focus")}
      backgroundColor={color("surface.raised")}
      paddingX={2}
      paddingY={1}
      onMouseUp={() => setFolded((folded) => !folded)}
    >
      <text>
        <span style={{ fg: color("text.accent") }}>Answers</span>
        <span style={{ fg: color("text.ghost") }}>{"  "}</span>
        <span style={{ fg: color("text.heading") }}>{props.answers.title}</span>
        <span style={{ fg: color("text.ghost") }}>
          {isFolded() ? `  ${props.answers.answered.length} answers  …` : ""}
        </span>
      </text>
      <Show when={!isFolded()}>
        <AnswersBody answers={props.answers} />
      </Show>
    </box>
  );
}

export function AnswersRow(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  return (
    <Show
      when={Option.getOrUndefined(decodeAnswers(props.entry.data))}
      fallback={<text fg={color("text.base")}>{props.entry.text}</text>}
    >
      {(answers) => <AnswersBand answers={answers()} />}
    </Show>
  );
}
