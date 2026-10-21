/**
 * The approval prompt, a custom prompt in the composer's draft area: which tool wants to run, the
 * reviewer's plain-words summary of the call (the command or path when it wrote none), and why the
 * call was flagged. Approve and reject are rows the cursor moves through; on reject a note line
 * opens under it for telling the agent why. More asks waiting show at the title's right end; the
 * oldest is the one shown. Esc rejects.
 */

import { Effect, Option, Schema } from "effect";
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import { InboxSlots } from "@liminal/inbox/contract";
import {
  enterKeys,
  type Hint,
  Hints,
  hintsPriority,
  ListRow,
  PROMPT_KEYS_PRIORITY,
  PromptPriority,
  type TuiHost,
  useBindings,
  useColor,
} from "@liminal/sdk/tui";

import type { PendingAsk } from "../contract.ts";

/** What the prompt reads and does, made once by the part's setup. */
export interface PromptDeps {
  readonly pending: Accessor<ReadonlyArray<PendingAsk>>;
  readonly answer: (id: string, approve: boolean, note: string) => void;
  /** Shows the keys for the prompt's state under the composer. */
  readonly setHints: (hints: ReadonlyArray<Hint>) => void;
  /** Whether a dialog is open, which takes the keys. */
  readonly dialogOpen: Accessor<boolean>;
}

const decodeSubject = Schema.decodeUnknownOption(
  Schema.Union([Schema.Struct({ command: Schema.String }), Schema.Struct({ path: Schema.String })]),
);

/** The command or path the call is about, else its params as JSON. */
const subjectOf = (ask: PendingAsk) =>
  Option.match(decodeSubject(ask.params), {
    onNone: () => JSON.stringify(ask.params),
    onSome: (found) => ("command" in found ? found.command : found.path),
  });

const choices = ["Approve", "Reject"] as const;

/** Under the Reject row, where its note goes: past the row's start, so it reads as Reject's. */
const NOTE_LEAD = "  └ ";

const hintsFor = (isRejecting: boolean): readonly Hint[] => [
  ["↑↓", "choose"],
  ["enter", isRejecting ? "reject" : "approve"],
  ["esc", "reject"],
];

/** The optional note a rejection sends to the model. */
function NoteLine(props: {
  readonly onInput: (note: string) => void;
  readonly onSubmit: () => void;
}) {
  const color = useColor();

  return (
    <box flexDirection="row" height={1}>
      <text wrapMode="none" flexShrink={0} fg={color("text.ghost")}>
        {NOTE_LEAD}
      </text>
      <input
        focused
        flexGrow={1}
        placeholder="Tell the agent why (optional)"
        onInput={props.onInput}
        onSubmit={props.onSubmit}
        backgroundColor={color("surface.selected")}
        focusedBackgroundColor={color("surface.selected")}
        textColor={color("text.heading")}
        focusedTextColor={color("text.heading")}
        placeholderColor={color("text.faint")}
        cursorColor={color("text.accent")}
      />
    </box>
  );
}

function Choices(props: {
  readonly chosen: number;
  readonly onInput: (note: string) => void;
  readonly onSubmit: () => void;
}) {
  const color = useColor();

  return (
    <box flexDirection="column" marginTop={1}>
      <For each={choices}>
        {(choice, index) => (
          <>
            <ListRow color={color} isSelected={index() === props.chosen}>
              <text fg={color(index() === props.chosen ? "text.base" : "text.muted")}>
                {choice}
              </text>
            </ListRow>
            <Show when={index() === 1 && props.chosen === 1}>
              <NoteLine onInput={props.onInput} onSubmit={props.onSubmit} />
            </Show>
          </>
        )}
      </For>
    </box>
  );
}

/** The prompt's cursor, its note and its keys; the keys are off while a dialog is open. */
const useApprovalKeys = (ask: PendingAsk, deps: PromptDeps) => {
  const [chosen, setChosen] = createSignal(0);
  const [note, setNote] = createSignal("");
  const isRejecting = () => chosen() === 1;

  const answer = (approve: boolean) => {
    deps.answer(ask.id, approve, approve ? "" : note());
  };

  createEffect(() => {
    deps.setHints(hintsFor(isRejecting()));
  });

  onCleanup(() => {
    deps.setHints([]);
  });

  useBindings(() => ({
    priority: PROMPT_KEYS_PRIORITY,
    commands: [
      { name: "approval.up", run: () => setChosen(0) },
      { name: "approval.down", run: () => setChosen(1) },
      {
        name: "approval.approve",
        run: () => {
          answer(true);
        },
      },
      {
        name: "approval.reject",
        run: () => {
          answer(false);
        },
      },
    ],
    bindings: deps.dialogOpen()
      ? []
      : [
          { key: "up", cmd: "approval.up" },
          { key: "down", cmd: "approval.down" },
          { key: "escape", cmd: "approval.reject" },
          ...(isRejecting() ? [] : enterKeys("approval.approve")),
        ],
  }));

  return {
    chosen,
    setNote,
    reject: () => {
      answer(false);
    },
  };
};

/** The oldest ask's prompt; keyed by the caller so a new ask starts afresh. */
export function ApprovalPrompt(props: { readonly ask: PendingAsk; readonly deps: PromptDeps }) {
  const color = useColor();
  const { chosen, setNote, reject } = useApprovalKeys(props.ask, props.deps);
  const waiting = () => props.deps.pending().length - 1;

  return (
    <box flexDirection="column" marginBottom={1}>
      <box flexDirection="row">
        <text flexGrow={1} wrapMode="none" truncate fg={color("text.heading")}>
          {`Run ${props.ask.tool}?`}
        </text>
        <Show when={waiting() > 0}>
          <text flexShrink={0} wrapMode="none" fg={color("text.faint")}>
            {`${waiting()} more waiting`}
          </text>
        </Show>
      </box>
      <text marginTop={1} fg={color("text.base")}>
        {props.ask.summary ?? subjectOf(props.ask)}
      </text>
      <text fg={color("text.muted")}>{`Asked because ${props.ask.reason}`}</text>
      <Choices chosen={chosen()} onInput={setNote} onSubmit={reject} />
    </box>
  );
}

/** The prompt in the composer's draft area and its key hints, while an ask waits. */
export const registerPrompt = (
  host: TuiHost["Service"],
  deps: PromptDeps,
  hints: Accessor<ReadonlyArray<Hint>>,
) => {
  const select = () => (deps.pending().length === 0 ? undefined : true);
  const priority = PromptPriority.approval;

  return Effect.gen(function* () {
    yield* host.register(InboxSlots.input, { select, priority }, function Prompt() {
      // The same ask arriving again keeps its prompt; a different ask starts afresh.
      const oldest = createMemo(() => deps.pending()[0], undefined, {
        equals: (before, after) => before?.id === after?.id,
      });

      return (
        <Show when={oldest()} keyed>
          {(ask) => <ApprovalPrompt ask={ask} deps={deps} />}
        </Show>
      );
    });

    yield* host.register(
      ChatSlots.composerHints,
      { select, priority: hintsPriority(priority) },
      function PromptHints() {
        const color = useColor();

        return <Hints color={color} hints={hints()} />;
      },
    );
  });
};
