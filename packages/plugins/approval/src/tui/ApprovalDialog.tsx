/**
 * Asks the user about one call: what it is, the reviewer's summary when there is one, and why it
 * was flagged. Up and down choose approve or reject; a rejection can carry a note for the model.
 * Esc rejects.
 */

import { Option, Schema } from "effect";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
  DialogFrame,
  type DialogProps,
  enterKeys,
  type Hint,
  useBindings,
  useColor,
} from "@liminal/sdk/tui";

import type { PendingAsk } from "../contract.ts";

export interface ApprovalDialogProps extends DialogProps {
  readonly ask: PendingAsk;
  /** Whether the ask still waits; once it does not, as after a cancelled turn, the dialog closes. */
  readonly waiting: () => boolean;
  readonly onAnswer: (approve: boolean, note: string) => void;
}

const decodeSubject = Schema.decodeUnknownOption(
  Schema.Union([Schema.Struct({ command: Schema.String }), Schema.Struct({ path: Schema.String })]),
);

/** The command or path the call is about, else its params as JSON. */
export const subjectOf = (ask: PendingAsk) =>
  Option.match(decodeSubject(ask.params), {
    onNone: () => JSON.stringify(ask.params),
    onSome: (found) => ("command" in found ? found.command : found.path),
  });

const choices = ["Approve", "Reject"] as const;

const hintsFor = (rejecting: boolean): readonly Hint[] => [
  ["↑↓", "choose"],
  ["enter", rejecting ? "reject" : "approve"],
  ["esc", "reject"],
];

function Choices(props: { readonly chosen: number }) {
  const color = useColor();

  return (
    <box flexDirection="column">
      <For each={choices}>
        {(choice, index) => (
          <text fg={color(index() === props.chosen ? "text.accent" : "text.base")}>
            {`${index() === props.chosen ? "›" : " "} ${choice}`}
          </text>
        )}
      </For>
    </box>
  );
}

/** The optional note a rejection sends to the model. */
function NoteInput(props: {
  readonly onInput: (note: string) => void;
  readonly onSubmit: () => void;
}) {
  const color = useColor();

  return (
    <box flexDirection="row">
      <text flexShrink={0} fg={color("text.accent")}>
        {"› "}
      </text>
      <input
        focused
        flexGrow={1}
        placeholder="Tell the agent why (optional)"
        onInput={props.onInput}
        onSubmit={props.onSubmit}
        backgroundColor={color("surface.raised")}
        focusedBackgroundColor={color("surface.raised")}
        textColor={color("text.heading")}
        focusedTextColor={color("text.heading")}
        placeholderColor={color("text.faint")}
        cursorColor={color("text.accent")}
      />
    </box>
  );
}

export function ApprovalDialog(props: ApprovalDialogProps) {
  const color = useColor();
  const [chosen, setChosen] = createSignal(0);
  const [note, setNote] = createSignal("");
  const rejecting = () => chosen() === 1;

  const answer = (approve: boolean) => {
    props.close();
    props.onAnswer(approve, approve ? "" : note());
  };

  createEffect(() => {
    if (!props.waiting()) props.close();
  });

  useBindings(() => ({
    commands: [
      { name: "approval.up", run: () => setChosen(0) },
      { name: "approval.down", run: () => setChosen(1) },
      {
        name: "approval.approve",
        run: () => {
          answer(true);
        },
      },
    ],
    bindings: [
      { key: "up", cmd: "approval.up" },
      { key: "down", cmd: "approval.down" },
      ...(rejecting() ? [] : enterKeys("approval.approve")),
    ],
  }));

  return (
    <DialogFrame
      title={`Run ${props.ask.tool}?`}
      hints={hintsFor(rejecting())}
      close={() => {
        answer(false);
      }}
    >
      <text fg={color("text.heading")}>{subjectOf(props.ask)}</text>
      <Show when={props.ask.summary}>
        {(summary) => <text fg={color("text.base")}>{summary()}</text>}
      </Show>
      <text fg={color("text.muted")}>{`Asked because ${props.ask.reason}`}</text>
      <Choices chosen={chosen()} />
      <Show when={rejecting()}>
        <NoteInput
          onInput={setNote}
          onSubmit={() => {
            answer(false);
          }}
        />
      </Show>
    </DialogFrame>
  );
}
