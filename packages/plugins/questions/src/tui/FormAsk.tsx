/**
 * `ask_question`'s form in the draft's place: the form's title, a tab per question and a last one
 * for additional notes, then the tab in view. A question with options lists them as rows to pick;
 * the user's note on the option they picked hangs under it, and a select question ends in a row for
 * the user's own answer. A written question and the notes tab are a field. The answer the model
 * suggests closes the tab. Up and down choose, enter picks or accepts, `n` notes an option, tab and
 * shift+tab move between tabs, esc cancels the turn; enter on the notes tab sends the answers.
 */

import type { BoxRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { Option, Schema } from "effect";
import { type Accessor, createEffect, createSignal, Show } from "solid-js";

import { type Command, keymapCommand, kit, useHintsWithin } from "@shanepadgett/liminal-tui";

import { formQuestion } from "../contract.ts";
import { Ask, moreAside } from "./Ask.tsx";
import type { AskProps } from "./asks.ts";
import {
  answersOf,
  dropNote,
  type FormState,
  formState,
  isOnOption,
  isWriting,
  moveRow,
  moveTab,
  pick,
  questionOf,
  saveNote,
  startNote,
} from "./form-state.ts";
import { FormBody, Tabs } from "./FormParts.tsx";

type Update = (change: (state: FormState) => FormState) => void;

const decodeForm = Schema.decodeOption(formQuestion.data);

const encodeAnswers = Schema.encodeSync(formQuestion.answer);

/** Up, down and enter on a question's rows and fields. */
const rowCommands = (state: Accessor<FormState>, update: Update): Command[] => {
  const hasRows = () => {
    const question = questionOf(state());

    return question !== undefined && question.kind !== "input" && state().noting === undefined;
  };

  const isField = () =>
    isWriting(state()) && state().noting === undefined && questionOf(state()) !== undefined;

  return [
    {
      name: "questions.up",
      title: "Previous row",
      hint: { label: "choose", keys: "↑↓" },
      enabled: hasRows,
      run: () => {
        update((each) => moveRow(each, -1));
      },
    },
    {
      name: "questions.down",
      title: "Next row",
      enabled: hasRows,
      run: () => {
        update((each) => moveRow(each, 1));
      },
    },
    {
      name: "questions.pick",
      title: "Pick",
      hint: { label: "pick" },
      enabled: () => isOnOption(state()),
      run: () => {
        update(pick);
      },
    },
    {
      name: "questions.accept",
      title: "Accept",
      hint: { label: "accept" },
      enabled: isField,
      run: () => {
        update((each) => (questionOf(each)?.kind === "input" ? moveTab(each, 1) : pick(each)));
      },
    },
  ];
};

/** `n` opens a note on the option under the cursor; enter keeps it and esc drops it. */
const noteCommands = (state: Accessor<FormState>, update: Update): Command[] => {
  const isNoting = () => state().noting !== undefined;

  return [
    {
      name: "questions.note",
      title: "Note",
      hint: { label: "note" },
      enabled: () => isOnOption(state()),
      run: () => {
        update(startNote);
      },
    },
    {
      name: "questions.save-note",
      title: "Save note",
      hint: { label: "save note" },
      enabled: isNoting,
      run: () => {
        update(saveNote);
      },
    },
    {
      name: "questions.drop-note",
      title: "Drop note",
      hint: { label: "drop note" },
      enabled: isNoting,
      run: () => {
        update(dropNote);
      },
    },
  ];
};

/** Tab and shift+tab between tabs, enter on the notes tab, and esc. */
const formCommands = (state: Accessor<FormState>, update: Update, props: AskProps): Command[] => {
  const isNoting = () => state().noting !== undefined;
  const isOnNotes = () => questionOf(state()) === undefined;

  return [
    {
      name: "questions.send",
      title: "Send answers",
      hint: { label: "send answers" },
      enabled: isOnNotes,
      run: () => {
        props.answer(encodeAnswers(answersOf(state())));
      },
    },
    {
      name: "questions.next",
      title: "Next question",
      hint: { label: "next" },
      enabled: () => !isNoting() && !isOnNotes(),
      run: () => {
        update((each) => moveTab(each, 1));
      },
    },
    {
      name: "questions.back",
      title: "Previous question",
      hint: { label: "back" },
      enabled: () => !isNoting() && state().tab > 0,
      run: () => {
        update((each) => moveTab(each, -1));
      },
    },
    {
      name: "questions.cancel",
      title: "Cancel",
      hint: { label: "cancel" },
      enabled: () => !isNoting(),
      run: props.cancel,
    },
  ];
};

const FORM_KEYS = [
  { key: "up", cmd: "questions.up" },
  { key: "down", cmd: "questions.down" },
  ...["return", "kpenter"].flatMap((key) =>
    ["questions.pick", "questions.accept", "questions.save-note", "questions.send"].map((cmd) => ({
      key,
      cmd,
    })),
  ),
  { key: "n", cmd: "questions.note" },
  { key: "tab", cmd: "questions.next" },
  { key: "shift+tab", cmd: "questions.back" },
  { key: "escape", cmd: "questions.drop-note" },
  { key: "escape", cmd: "questions.cancel" },
];

function Form(props: AskProps & { readonly state: FormState; readonly update: Update }) {
  const state = () => props.state;
  let root: BoxRenderable | undefined;

  useBindings(() => ({
    target: () => root,
    commands: [
      ...rowCommands(state, props.update),
      ...noteCommands(state, props.update),
      ...formCommands(state, props.update, props),
    ].map(keymapCommand),
    bindings: FORM_KEYS,
  }));

  const hints = useHintsWithin(() => root);

  // A field takes focus when it shows; on a row, the form holds it.
  createEffect(() => {
    if (!isWriting(props.state)) root?.focus();
  });

  return (
    <box
      ref={(made) => {
        root = made;
      }}
      focusable
      flexShrink={0}
      paddingX={2}
      paddingTop={1}
    >
      <Ask
        mark="?"
        markRole="text.accent"
        title={props.state.form.title}
        aside={moreAside(props.more)}
      >
        <Tabs state={props.state} />
        <box marginTop={1}>
          <FormBody state={props.state} update={props.update} />
        </box>
      </Ask>
      <box marginTop={1}>
        <kit.Hints hints={hints()} end />
      </box>
    </box>
  );
}

export function FormAsk(props: AskProps) {
  const form = () => Option.getOrUndefined(decodeForm(props.ask.data));

  return (
    <Show when={form()} keyed>
      {(asked) => {
        const [state, setState] = createSignal(formState(asked));

        return (
          <Form
            {...props}
            state={state()}
            update={(change) => {
              setState(change);
            }}
          />
        );
      }}
    </Show>
  );
}
