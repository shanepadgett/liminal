/**
 * The composer's draft area taken over by the assistant's questions: the form's title, its tabs,
 * and the tab in view, a question to choose or write an answer for, or additional context. Tab and
 * shift+tab move between tabs, enter picks or accepts, `n` notes an option, esc cancels the form.
 * Any question left open is sent as skipped.
 */

import {
  type Accessor,
  createEffect,
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";

import { enterKeys, type Hint, useBindings, useColor } from "@liminal/sdk/tui";

import type { Answers, Form, Question } from "../contract.ts";
import { ChoiceTab, type ChoiceEvents } from "./ChoiceTab.tsx";
import {
  answersOf,
  type Draft,
  dropNote,
  type FormState,
  formState,
  hintsOf,
  isWriting,
  moveRow,
  moveTab,
  pick,
  questionOf,
  saveNote,
  setContext,
  setNote,
  setOwn,
  setText,
  startNote,
} from "./form.ts";
import { FormTabs, WriteTab } from "./parts.tsx";

/** What the form does with the user's answers, made once by the part's setup. */
export interface FormDeps {
  readonly send: (answers: Answers) => void;
  readonly cancel: () => void;
  /** Shows the keys for the tab in view under the composer. */
  readonly setHints: (hints: ReadonlyArray<Hint>) => void;
  /** Whether a dialog is open, which takes the keys. */
  readonly dialogOpen: Accessor<boolean>;
}

/** Above the composer's own keys. */
const KEYS_PRIORITY = 1;

const choosingKeys = (state: FormState) =>
  isWriting(state) ? [] : [...enterKeys("questions.pick"), { key: "n", cmd: "questions.note" }];

const rowKeys = (state: FormState) =>
  questionOf(state)?.kind === "input" || state.noting !== undefined
    ? []
    : [
        { key: "up", cmd: "questions.up" },
        { key: "down", cmd: "questions.down" },
      ];

const formKeys = (state: FormState, dialogOpen: boolean) =>
  dialogOpen
    ? []
    : [
        { key: "tab", cmd: "questions.next" },
        { key: "shift+tab", cmd: "questions.back" },
        { key: "escape", cmd: "questions.escape" },
        ...rowKeys(state),
        ...choosingKeys(state),
      ];

/** Enter in a field: keeps a note, picks the own answer, moves past a written one, or sends. */
const submitted = (state: FormState) => (send: () => void) => {
  if (state.noting !== undefined) return saveNote(state);

  const question = questionOf(state);

  if (question === undefined) {
    send();

    return state;
  }

  return question.kind === "input" ? moveTab(state, 1) : pick(state);
};

/** A question's tab: its options to choose from, or a field to write the answer in. */
function QuestionTab(props: {
  readonly state: FormState;
  readonly question: Question;
  readonly draft: Draft;
  readonly events: ChoiceEvents;
  readonly onText: (text: string) => void;
}) {
  return (
    <Switch>
      <Match when={props.draft.kind === "choice" && props.draft}>
        {(picking) => (
          <ChoiceTab
            question={props.question}
            draft={picking()}
            row={props.state.row}
            noting={props.state.noting}
            events={props.events}
          />
        )}
      </Match>
      <Match when={props.draft.kind === "text" && props.draft}>
        {(writing) => (
          <WriteTab
            prompt={props.question.prompt}
            aside=""
            recommendation={props.question.recommendation}
            text={writing().text}
            placeholder="Your answer"
            onInput={props.onText}
            onSubmit={props.events.onSubmit}
          />
        )}
      </Match>
    </Switch>
  );
}

type Update = (change: (state: FormState) => FormState) => void;

/** The form's own key commands, each a change to its state except esc, which may cancel. */
const formCommands = (state: Accessor<FormState>, update: Update, deps: FormDeps) => {
  const changes: ReadonlyArray<readonly [string, (state: FormState) => FormState]> = [
    ["questions.next", (each) => moveTab(each, 1)],
    ["questions.back", (each) => moveTab(each, -1)],
    ["questions.up", (each) => moveRow(each, -1)],
    ["questions.down", (each) => moveRow(each, 1)],
    ["questions.pick", pick],
    ["questions.note", startNote],
  ];

  return [
    ...changes.map(([name, change]) => ({
      name,
      run: () => {
        update(change);
      },
    })),
    {
      name: "questions.escape",
      run: () => {
        if (state().noting === undefined) deps.cancel();
        else update(dropNote);
      },
    },
  ];
};

/** Binds the form's keys while no dialog is open, and shows their hints under the composer. */
const useFormKeys = (state: Accessor<FormState>, update: Update, deps: FormDeps) => {
  createEffect(() => {
    deps.setHints(hintsOf(state()));
  });

  onCleanup(() => {
    deps.setHints([]);
  });

  useBindings(() => ({
    priority: KEYS_PRIORITY,
    commands: formCommands(state, update, deps),
    bindings: formKeys(state(), deps.dialogOpen()),
  }));
};

/** The tab in view: a question, or the closing additional context. */
function FormBody(props: {
  readonly state: FormState;
  readonly update: Update;
  readonly events: ChoiceEvents;
}) {
  const question = () => questionOf(props.state);
  const draft = () => props.state.drafts.at(props.state.tab);

  return (
    <Show
      when={question()}
      keyed
      fallback={
        <WriteTab
          prompt="Anything else the assistant should know?"
          aside="optional"
          recommendation={undefined}
          text={props.state.context}
          placeholder="Additional context"
          onInput={(context) => {
            props.update((each) => setContext(each, context));
          }}
          onSubmit={props.events.onSubmit}
        />
      }
    >
      {(asked) => (
        <Show when={draft()}>
          {(given) => (
            <QuestionTab
              state={props.state}
              question={asked}
              draft={given()}
              events={props.events}
              onText={(text) => {
                props.update((each) => setText(each, text));
              }}
            />
          )}
        </Show>
      )}
    </Show>
  );
}

export function QuestionForm(props: { readonly form: Form; readonly deps: FormDeps }) {
  const color = useColor();
  const [state, setState] = createSignal(formState(props.form));

  const update: Update = (change) => {
    setState(change);
  };

  const send = () => {
    props.deps.send(answersOf(state()));
  };

  useFormKeys(state, update, props.deps);

  const events: ChoiceEvents = {
    onOwn: (own) => {
      update((each) => setOwn(each, own));
    },
    onNote: (text) => {
      update((each) => setNote(each, text));
    },
    onSubmit: () => {
      update((each) => submitted(each)(send));
    },
  };

  return (
    <box flexDirection="column">
      <text wrapMode="none" truncate fg={color("text.heading")}>
        {props.form.title}
      </text>
      <box marginTop={1}>
        <FormTabs state={state()} />
      </box>
      <box flexDirection="column" marginTop={1}>
        <FormBody state={state()} update={update} events={events} />
      </box>
    </box>
  );
}
