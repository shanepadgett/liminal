/**
 * Where the user writes: a raised surface with the input and, under it, the model in the accent
 * color with its thinking option. Enter sends; while a turn runs it steers the turn and Tab queues
 * a follow-up instead. Queued input shows above the input until the turn takes it.
 */

import type { TextareaRenderable } from "@opentui/core";
import type { Accessor, Setter } from "solid-js";
import { For, Show } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import { type Hint, Hints, type TuiCommandsService, useBindings, useColor } from "@liminal/sdk/tui";

import type { Queued, SendMode } from "../contract.ts";
import { useSlash } from "./slash.ts";
import { SlashMenu } from "./SlashMenu.tsx";

const INPUT_ROWS = 2;

/**
 * The default model and its thinking option's label, empty when it has none, or why no model is
 * set.
 */
export type ModelLine =
  | { readonly set: true; readonly model: string; readonly thinking: string }
  | { readonly set: false; readonly reason: string };

/** What the composer reads and does, made once by the part's setup. */
export interface ComposerDeps {
  /** The session's draft, shared with its hints. */
  readonly draft: (session: SessionId) => readonly [Accessor<string>, Setter<string>];
  readonly send: (session: SessionId, text: string, mode: SendMode) => void;
  readonly queue: (session: SessionId) => Accessor<Queued>;
  /** The model line, or why no turn can start. */
  readonly model: Accessor<ModelLine>;
  /** The last send's failure, if it failed. */
  readonly problem: Accessor<string>;
  /** The commands a submitted `/name` runs. */
  readonly commands: TuiCommandsService;
  /** Whether a dialog is open, which takes the input's focus. */
  readonly dialogOpen: Accessor<boolean>;
}

interface TurnProps {
  readonly sessionId: SessionId;
  readonly running: boolean;
}

/** The line's model and thinking option when one is set. */
const setModel = (line: ModelLine) => (line.set ? line : undefined);

/** Why no model is set; empty when one is. */
const reasonOf = (line: ModelLine) => (line.set ? "" : line.reason);

function ModelLine(props: { readonly deps: ComposerDeps }) {
  const color = useColor();
  const line = () => props.deps.model();

  return (
    <text wrapMode="none">
      <Show
        when={setModel(line())}
        fallback={<span style={{ fg: color("feedback.warning") }}>{reasonOf(line())}</span>}
      >
        {(set) => (
          <>
            <span style={{ fg: color("text.accent") }}>{set().model}</span>
            <Show when={set().thinking !== ""}>
              <span style={{ fg: color("text.muted") }}>{` (${set().thinking})`}</span>
            </Show>
          </>
        )}
      </Show>
    </text>
  );
}

function QueuedLines(props: { readonly queued: Queued }) {
  const color = useColor();

  return (
    <For each={[...props.queued.steers, ...props.queued.followUps]}>
      {(text) => (
        <text wrapMode="none" fg={color("text.faint")}>
          {`↳ ${text}`}
        </text>
      )}
    </For>
  );
}

/** The textarea: enter submits, shift+enter starts a new line. */
function Input(props: {
  readonly ref: (made: TextareaRenderable) => void;
  readonly focused: boolean;
  readonly onSubmit: () => void;
  readonly onChange: () => void;
}) {
  const color = useColor();
  const surface = () => color("surface.raised");

  return (
    <textarea
      ref={props.ref}
      focused={props.focused}
      height={INPUT_ROWS}
      placeholder="Ask anything"
      keyBindings={[
        { name: "return", action: "submit" },
        { name: "return", shift: true, action: "newline" },
      ]}
      onSubmit={props.onSubmit}
      onContentChange={props.onChange}
      backgroundColor={surface()}
      focusedBackgroundColor={surface()}
      textColor={color("text.base")}
      focusedTextColor={color("text.base")}
      placeholderColor={color("text.faint")}
      cursorColor={color("text.accent")}
    />
  );
}

export const makeComposer = (deps: ComposerDeps) =>
  function Composer(props: TurnProps) {
    const color = useColor();
    const surface = () => color("surface.raised");
    const [draft, setDraft] = deps.draft(props.sessionId);
    const queued = deps.queue(props.sessionId);
    let input: TextareaRenderable | undefined;
    const slash = useSlash({ commands: deps.commands, draft, input: () => input });

    const send = (mode: SendMode) => {
      const text = input?.plainText.trim() ?? "";
      if (text === "") return;
      input?.clear();
      if (!slash.submit(text)) deps.send(props.sessionId, text, mode);
    };

    const queueKeys = () => (props.running ? [{ key: "tab", cmd: "inbox.queue" }] : []);

    useBindings(() => ({
      commands: [
        ...slash.commands,
        {
          name: "inbox.queue",
          run: () => {
            send("follow-up");
          },
        },
      ],
      bindings: slash.open() ? slash.bindings : queueKeys(),
    }));

    return (
      <box
        flexDirection="column"
        flexShrink={0}
        backgroundColor={surface()}
        paddingX={2}
        paddingY={1}
      >
        <QueuedLines queued={queued()} />
        <Show when={slash.open()}>
          <SlashMenu matches={slash.matches()} selected={slash.selected()} />
        </Show>
        <Input
          ref={(made) => (input = made)}
          focused={!deps.dialogOpen()}
          onSubmit={() => {
            send("steer");
          }}
          onChange={() => setDraft(input?.plainText ?? "")}
        />
        <ModelLine deps={deps} />
        <Show when={deps.problem() !== ""}>
          <text fg={color("feedback.danger")}>{deps.problem()}</text>
        </Show>
      </box>
    );
  };

const hintsFor = (running: boolean, hasDraft: boolean): readonly Hint[] => {
  if (!hasDraft) return running ? [] : [["enter", "send"]];

  return running
    ? [
        ["enter", "steer"],
        ["tab", "queue"],
      ]
    : [
        ["enter", "send"],
        ["shift+enter", "newline"],
      ];
};

export const makeHints = (deps: ComposerDeps) =>
  function ComposerHints(props: TurnProps) {
    const color = useColor();
    const [draft] = deps.draft(props.sessionId);

    return <Hints color={color} hints={hintsFor(props.running, draft().trim() !== "")} />;
  };
