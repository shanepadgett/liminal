/**
 * The form's smaller parts: its tabs, the suggested answer under a question, the one-line field the
 * user writes in, and the tab they answer in their own words.
 */

import { Index, Show, untrack } from "solid-js";

import { useColor, type RoleName } from "@liminal/sdk/tui";

import type { Recommendation } from "../contract.ts";
import { answersOf, type FormState } from "./form.ts";

interface TabLabel {
  readonly text: string;
  readonly isDone: boolean;
}

/** A number per question, done unless it would be sent as skipped, then additional context. */
const labelsOf = (state: FormState): ReadonlyArray<TabLabel> => {
  const answers = answersOf(state);

  return [
    ...answers.answered.map(({ answer }, index) => ({
      text: String(index + 1),
      isDone: answer.kind !== "skipped",
    })),
    { text: "context", isDone: answers.context !== "" },
  ];
};

const roleOf = (label: TabLabel, isCurrent: boolean): RoleName => {
  if (isCurrent) return "text.heading";

  return label.isDone ? "text.muted" : "text.faint";
};

/**
 * A number per question, ticked once answered, then additional context. The tab in view sits on the
 * selected surface; unanswered ones are faint.
 */
export function FormTabs(props: { readonly state: FormState }) {
  const color = useColor();

  return (
    <box flexDirection="row" height={1} marginX={-1}>
      <Index each={labelsOf(props.state)}>
        {(label, index) => {
          const isCurrent = () => index === props.state.tab;

          return (
            <text
              wrapMode="none"
              flexShrink={0}
              bg={isCurrent() ? color("surface.selected") : "transparent"}
            >
              <span style={{ fg: color(roleOf(label(), isCurrent())) }}>{` ${label().text}`}</span>
              <span style={{ fg: color("feedback.success") }}>{label().isDone ? " ✓" : ""}</span>
              <span> </span>
            </text>
          );
        }}
      </Index>
    </box>
  );
}

/** The answer the model suggests and why, set quietly under the question. */
export function Suggested(props: { readonly recommendation: Recommendation }) {
  const color = useColor();

  return (
    <box flexDirection="row">
      <text wrapMode="none" flexShrink={0} fg={color("text.ghost")}>
        {"suggested  "}
      </text>
      <box flexDirection="column" flexShrink={1}>
        <text fg={color("text.accent")}>{props.recommendation.answer}</text>
        <text fg={color("text.faint")}>{props.recommendation.reason}</text>
      </box>
    </box>
  );
}

/** A focused one-line field starting at `value`; enter calls `onSubmit`. */
export function Field(props: {
  readonly value: string;
  readonly placeholder: string;
  readonly surface: RoleName;
  readonly onInput: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  const color = useColor();
  const surface = () => color(props.surface);

  return (
    <input
      focused
      flexGrow={1}
      value={untrack(() => props.value)}
      placeholder={props.placeholder}
      onInput={props.onInput}
      onSubmit={props.onSubmit}
      backgroundColor={surface()}
      focusedBackgroundColor={surface()}
      textColor={color("text.heading")}
      focusedTextColor={color("text.heading")}
      placeholderColor={color("text.faint")}
      cursorColor={color("text.accent")}
    />
  );
}

/**
 * A tab the user answers in their own words: a question that wants a written answer, with the
 * suggested one, or the closing tab for anything else the model should know.
 */
export function WriteTab(props: {
  readonly prompt: string;
  /** Said after the prompt, more quietly, such as that the tab is optional. */
  readonly aside: string;
  readonly recommendation: Recommendation | undefined;
  readonly text: string;
  readonly placeholder: string;
  readonly onInput: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  const color = useColor();

  return (
    <box flexDirection="column">
      <text>
        <span style={{ fg: color("text.base") }}>{props.prompt}</span>
        <span style={{ fg: color("text.faint") }}>
          {props.aside === "" ? "" : `  ${props.aside}`}
        </span>
      </text>
      <Show when={props.recommendation}>
        {(recommendation) => (
          <box marginTop={1}>
            <Suggested recommendation={recommendation()} />
          </box>
        )}
      </Show>
      <box flexDirection="row" height={1} marginTop={1}>
        <text wrapMode="none" flexShrink={0} fg={color("text.accent")}>
          {"› "}
        </text>
        <Field
          value={props.text}
          placeholder={props.placeholder}
          surface="surface.raised"
          onInput={props.onInput}
          onSubmit={props.onSubmit}
        />
      </box>
    </box>
  );
}
