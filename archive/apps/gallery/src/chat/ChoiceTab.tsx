/**
 * A select or yes-or-no question in the composer's form: the prompt, then its options as rows the
 * cursor moves through, the picked one marked. Labels sit in one column so descriptions line up. A
 * note the user left hangs under its option, and an open note is a field there. A select question
 * ends in a row where the user writes their own answer. The suggested answer closes the tab.
 */

import { Index, Show } from "solid-js";

import { type AnswerOption, optionsOf, type Question } from "@liminal/questions/contract";
import type { RoleColor } from "@liminal/sdk/tui";

import type { Draft } from "./formState.ts";
import { ListRow } from "./ListRow.tsx";
import { Suggested } from "./Suggested.tsx";

type Choice = Extract<Draft, { kind: "choice" }>;

const PICKED = "● ";
const UNPICKED = "○ ";

/** Columns between the longest label and the descriptions. */
const LABEL_GAP = 2;

/** Under an option, where its note goes: past the mark, so it reads as the option's. */
const NOTE_LEAD = "  └ ";

const OWN_PLACEHOLDER = "Other…";

function Field(props: {
  readonly color: RoleColor;
  readonly value: string;
  readonly placeholder: string;
}) {
  const surface = () => props.color("surface.selected");

  return (
    <textarea
      flexGrow={1}
      height={1}
      initialValue={props.value}
      placeholder={props.placeholder}
      backgroundColor={surface()}
      focusedBackgroundColor={surface()}
      textColor={props.color("text.heading")}
      focusedTextColor={props.color("text.heading")}
      placeholderColor={props.color("text.faint")}
      cursorColor={props.color("text.accent")}
    />
  );
}

function Mark(props: { readonly color: RoleColor; readonly isPicked: boolean }) {
  return (
    <text
      wrapMode="none"
      flexShrink={0}
      fg={props.color(props.isPicked ? "text.accent" : "text.ghost")}
    >
      {props.isPicked ? PICKED : UNPICKED}
    </text>
  );
}

/** A note left on an option, or the field for the one being written. */
function NoteLine(props: {
  readonly color: RoleColor;
  readonly note: string | undefined;
  readonly isOpen: boolean;
}) {
  return (
    <Show
      when={props.isOpen}
      fallback={
        <Show when={props.note}>
          {(text) => (
            <text>
              <span style={{ fg: props.color("text.ghost") }}>{NOTE_LEAD}</span>
              <span style={{ fg: props.color("text.muted") }}>{text()}</span>
            </text>
          )}
        </Show>
      }
    >
      <box flexDirection="row" height={1}>
        <text wrapMode="none" flexShrink={0} fg={props.color("text.ghost")}>
          {NOTE_LEAD}
        </text>
        <Field color={props.color} value={props.note ?? ""} placeholder="Note on this option" />
      </box>
    </Show>
  );
}

function OptionRow(props: {
  readonly color: RoleColor;
  readonly option: AnswerOption;
  readonly labelWidth: number;
  readonly isUnder: boolean;
  readonly isPicked: boolean;
}) {
  return (
    <ListRow color={props.color} isSelected={props.isUnder}>
      <Mark color={props.color} isPicked={props.isPicked} />
      <text
        wrapMode="none"
        width={props.labelWidth}
        flexShrink={0}
        fg={props.color(props.isUnder ? "text.heading" : "text.base")}
      >
        {props.option.label}
      </text>
      <text
        wrapMode="none"
        truncate
        flexShrink={1}
        fg={props.color(props.isUnder ? "text.muted" : "text.faint")}
      >
        {props.option.description ?? ""}
      </text>
    </ListRow>
  );
}

/** The row for the user's own answer: a field under the cursor, else what they wrote. */
function OwnRow(props: {
  readonly color: RoleColor;
  readonly draft: Choice;
  readonly isUnder: boolean;
}) {
  return (
    <ListRow color={props.color} isSelected={props.isUnder}>
      <Mark color={props.color} isPicked={props.draft.picked === "own"} />
      <Show
        when={props.isUnder}
        fallback={
          <text
            wrapMode="none"
            fg={props.color(props.draft.own === "" ? "text.faint" : "text.base")}
          >
            {props.draft.own === "" ? OWN_PLACEHOLDER : props.draft.own}
          </text>
        }
      >
        <Field color={props.color} value={props.draft.own} placeholder={OWN_PLACEHOLDER} />
      </Show>
    </ListRow>
  );
}

export function ChoiceTab(props: {
  readonly color: RoleColor;
  readonly question: Question;
  readonly draft: Choice;
  readonly row: number;
  readonly noting: number | undefined;
}) {
  const options = () => optionsOf(props.question);
  const labelWidth = () => Math.max(...options().map((option) => option.label.length)) + LABEL_GAP;

  return (
    <box flexDirection="column">
      <text fg={props.color("text.base")}>{props.question.prompt}</text>
      <box flexDirection="column" marginTop={1}>
        <Index each={options()}>
          {(option, index) => (
            <>
              <OptionRow
                color={props.color}
                option={option()}
                labelWidth={labelWidth()}
                isUnder={index === props.row}
                isPicked={props.draft.picked === index}
              />
              <NoteLine
                color={props.color}
                note={props.draft.notes[index]}
                isOpen={props.noting === index}
              />
            </>
          )}
        </Index>
        <Show when={props.question.kind === "select"}>
          <OwnRow
            color={props.color}
            draft={props.draft}
            isUnder={props.row === options().length}
          />
        </Show>
      </box>
      <Show when={props.question.recommendation}>
        {(recommendation) => (
          <box marginTop={1}>
            <Suggested color={props.color} recommendation={recommendation()} />
          </box>
        )}
      </Show>
    </box>
  );
}
