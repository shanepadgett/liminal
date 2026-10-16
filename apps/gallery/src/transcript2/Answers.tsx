/**
 * The user's answers to a form of questions, sent as their next prompt and drawn in the same raised
 * band with the accent bar as anything else they send. Each question stays muted with the answer
 * under it in the user's voice, or `skipped` in faint text, then what sets the answer apart: the
 * user's own in place of the options, whether it is the one the assistant suggested, and if not,
 * what was suggested. Notes the user left on options hang under the answer, and any added context
 * closes the band.
 */

import { Index, Show } from "solid-js";

import { EDGE_BAR } from "../ornament/edgeBar.ts";
import type { RoleColor } from "../tokens/roles.ts";
import { answerTextOf, notesOf, passedOverOf, tagsOf } from "./questions.ts";
import type { Answered } from "./script.ts";

/** The question numbers' column, so prompts that wrap stay clear of them. */
const NUMBER_WIDTH = 3;

function AnswerItem(props: {
  readonly color: RoleColor;
  readonly answered: Answered;
  readonly number: string;
}) {
  const tags = () => tagsOf(props.answered);
  const isSkipped = () => props.answered.answer.kind === "skipped";

  return (
    <box flexDirection="row" marginTop={1}>
      <text width={NUMBER_WIDTH} flexShrink={0} fg={props.color("text.faint")}>
        {props.number}
      </text>
      <box flexDirection="column" flexGrow={1} flexShrink={1}>
        <text fg={props.color("text.muted")}>{props.answered.question.prompt}</text>
        <text>
          <span style={{ fg: props.color("text.accent") }}>{"→ "}</span>
          <span style={{ fg: props.color(isSkipped() ? "text.faint" : "text.heading") }}>
            {answerTextOf(props.answered.answer)}
          </span>
          <span style={{ fg: props.color("text.ghost") }}>
            {tags() === "" ? "" : `  ${tags()}`}
          </span>
        </text>
        <Show when={passedOverOf(props.answered)}>
          {(suggested) => (
            <text fg={props.color("text.ghost")}>{`  suggested ${suggested()}`}</text>
          )}
        </Show>
        <Index each={notesOf(props.answered.answer)}>
          {(note) => (
            <text>
              <span
                style={{ fg: props.color("text.ghost") }}
              >{`  └ note on ${note().option}  `}</span>
              <span style={{ fg: props.color("text.muted") }}>{note().text}</span>
            </text>
          )}
        </Index>
      </box>
    </box>
  );
}

export function Answers(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly answered: readonly Answered[];
  readonly context: string;
}) {
  return (
    <box
      flexDirection="column"
      border={["left"]}
      customBorderChars={EDGE_BAR}
      borderColor={props.color("border.focus")}
      backgroundColor={props.color("surface.raised")}
      paddingX={2}
      paddingY={1}
    >
      <text>
        <span style={{ fg: props.color("text.accent") }}>Answers</span>
        <span style={{ fg: props.color("text.ghost") }}>{"  "}</span>
        <span style={{ fg: props.color("text.heading") }}>{props.title}</span>
      </text>
      <Index each={props.answered}>
        {(answered, index) => (
          <AnswerItem color={props.color} answered={answered()} number={`${index + 1}`} />
        )}
      </Index>
      <Show when={props.context !== ""}>
        <box flexDirection="row" marginTop={1}>
          <text width={NUMBER_WIDTH} flexShrink={0} fg={props.color("text.faint")}>
            +
          </text>
          <box flexDirection="column" flexGrow={1} flexShrink={1}>
            <text fg={props.color("text.muted")}>Additional context</text>
            <text fg={props.color("text.heading")}>{props.context}</text>
          </box>
        </box>
      </Show>
    </box>
  );
}
