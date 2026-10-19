/**
 * A select or yes-or-no question in the form: the prompt, then its options as rows the cursor moves
 * through, the picked one marked, labels in one column so descriptions line up. A note hangs under
 * its option, and an open note is a field there. A select question ends in a row where the user
 * writes their own answer. The suggested answer closes the tab.
 */

import type { JSX } from "@opentui/solid";
import { Index, Show } from "solid-js";

import { useColor } from "@liminal/sdk/tui";

import { type AnswerOption, optionsOf, type Question } from "../contract.ts";
import type { Choice, Noting } from "./form.ts";
import { Field, Suggested } from "./parts.tsx";

/** Columns between the longest label and the descriptions. */
const LABEL_GAP = 2;

/** Under an option, where its note goes: past the mark, so it reads as the option's. */
const NOTE_LEAD = "  └ ";

const OWN_PLACEHOLDER = "Other…";

/** What the tab's fields report. */
export interface ChoiceEvents {
  readonly onOwn: (own: string) => void;
  readonly onNote: (text: string) => void;
  readonly onSubmit: () => void;
}

function ListRow(props: { readonly isSelected: boolean; readonly children: JSX.Element }) {
  const color = useColor();

  return (
    <box
      flexDirection="row"
      height={1}
      marginX={-1}
      paddingX={1}
      backgroundColor={props.isSelected ? color("surface.selected") : "transparent"}
    >
      {props.children}
    </box>
  );
}

function Mark(props: { readonly isPicked: boolean }) {
  const color = useColor();

  return (
    <text wrapMode="none" flexShrink={0} fg={color(props.isPicked ? "text.accent" : "text.ghost")}>
      {props.isPicked ? "● " : "○ "}
    </text>
  );
}

/** A note left on an option, or the field for the one being written. */
function NoteLine(props: {
  readonly note: string | undefined;
  readonly open: Noting | undefined;
  readonly events: ChoiceEvents;
}) {
  const color = useColor();

  return (
    <Show
      when={props.open}
      fallback={
        <Show when={props.note}>
          {(text) => (
            <text>
              <span style={{ fg: color("text.ghost") }}>{NOTE_LEAD}</span>
              <span style={{ fg: color("text.muted") }}>{text()}</span>
            </text>
          )}
        </Show>
      }
    >
      {(open) => (
        <box flexDirection="row" height={1}>
          <text wrapMode="none" flexShrink={0} fg={color("text.ghost")}>
            {NOTE_LEAD}
          </text>
          <Field
            value={open().text}
            placeholder="Note on this option"
            surface="surface.selected"
            onInput={props.events.onNote}
            onSubmit={props.events.onSubmit}
          />
        </box>
      )}
    </Show>
  );
}

function OptionRow(props: {
  readonly option: AnswerOption;
  readonly labelWidth: number;
  readonly isUnder: boolean;
  readonly isPicked: boolean;
}) {
  const color = useColor();

  return (
    <ListRow isSelected={props.isUnder}>
      <Mark isPicked={props.isPicked} />
      <text
        wrapMode="none"
        width={props.labelWidth}
        flexShrink={0}
        fg={color(props.isUnder ? "text.heading" : "text.base")}
      >
        {props.option.label}
      </text>
      <text
        wrapMode="none"
        truncate
        flexShrink={1}
        fg={color(props.isUnder ? "text.muted" : "text.faint")}
      >
        {props.option.description ?? ""}
      </text>
    </ListRow>
  );
}

/** The row for the user's own answer: a field under the cursor, else what they wrote. */
function OwnRow(props: {
  readonly draft: Choice;
  readonly isUnder: boolean;
  readonly events: ChoiceEvents;
}) {
  const color = useColor();

  return (
    <ListRow isSelected={props.isUnder}>
      <Mark isPicked={props.draft.picked === "own"} />
      <Show
        when={props.isUnder}
        fallback={
          <text wrapMode="none" fg={color(props.draft.own === "" ? "text.faint" : "text.base")}>
            {props.draft.own === "" ? OWN_PLACEHOLDER : props.draft.own}
          </text>
        }
      >
        <Field
          value={props.draft.own}
          placeholder={OWN_PLACEHOLDER}
          surface="surface.selected"
          onInput={props.events.onOwn}
          onSubmit={props.events.onSubmit}
        />
      </Show>
    </ListRow>
  );
}

/** Wide enough for the longest label and the gap before the descriptions. */
const labelWidthOf = (options: ReadonlyArray<AnswerOption>) => {
  let widest = 0;
  for (const option of options) widest = Math.max(widest, option.label.length);

  return widest + LABEL_GAP;
};

export function ChoiceTab(props: {
  readonly question: Question;
  readonly draft: Choice;
  readonly row: number;
  readonly noting: Noting | undefined;
  readonly events: ChoiceEvents;
}) {
  const color = useColor();
  const options = () => optionsOf(props.question);
  const labelWidth = () => labelWidthOf(options());

  return (
    <box flexDirection="column">
      <text fg={color("text.base")}>{props.question.prompt}</text>
      <box flexDirection="column" marginTop={1}>
        <Index each={options()}>
          {(option, index) => (
            <>
              <OptionRow
                option={option()}
                labelWidth={labelWidth()}
                isUnder={index === props.row}
                isPicked={props.draft.picked === index}
              />
              <NoteLine
                note={props.draft.notes[index]}
                open={props.noting?.option === index ? props.noting : undefined}
                events={props.events}
              />
            </>
          )}
        </Index>
        <Show when={props.question.kind === "select"}>
          <OwnRow
            draft={props.draft}
            isUnder={props.row === options().length}
            events={props.events}
          />
        </Show>
      </box>
      <Show when={props.question.recommendation}>
        {(recommendation) => (
          <box marginTop={1}>
            <Suggested recommendation={recommendation()} />
          </box>
        )}
      </Show>
    </box>
  );
}
