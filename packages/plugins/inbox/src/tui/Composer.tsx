/**
 * Where the user writes: a raised surface with the input and, under it, the model in the accent
 * color with its thinking level. Enter sends; while a turn runs it steers the turn and Tab queues a
 * follow-up instead. Queued input shows above the input until the turn takes it.
 */

import type { TextareaRenderable } from "@opentui/core";
import type { Accessor, Setter } from "solid-js";
import { For, Show } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import { type Hint, Hints, useBindings, useColor } from "@liminal/sdk/tui";

import type { Queued, SendMode } from "../contract.ts";

const INPUT_ROWS = 2;

/** The default model and thinking level, or why there is none; empty while loading. */
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
}

interface TurnProps {
  readonly sessionId: SessionId;
  readonly running: boolean;
}

/** The line's model and thinking level when one is set. */
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
            <span style={{ fg: color("text.muted") }}>{` (${set().thinking})`}</span>
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

export const makeComposer = (deps: ComposerDeps) =>
  function Composer(props: TurnProps) {
    const color = useColor();
    const surface = () => color("surface.raised");
    const [, setDraft] = deps.draft(props.sessionId);
    const queued = deps.queue(props.sessionId);
    let input: TextareaRenderable | undefined;

    const send = (mode: SendMode) => {
      const text = input?.plainText.trim() ?? "";
      if (text === "") return;
      input?.clear();
      deps.send(props.sessionId, text, mode);
    };

    useBindings(() => ({
      commands: [
        {
          name: "inbox.queue",
          run: () => {
            send("follow-up");
          },
        },
      ],
      bindings: props.running ? [{ key: "tab", cmd: "inbox.queue" }] : [],
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
        <textarea
          ref={(made: TextareaRenderable) => (input = made)}
          focused
          height={INPUT_ROWS}
          placeholder="Ask anything"
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
          ]}
          onSubmit={() => {
            send("steer");
          }}
          onContentChange={() => setDraft(input?.plainText ?? "")}
          backgroundColor={surface()}
          focusedBackgroundColor={surface()}
          textColor={color("text.base")}
          focusedTextColor={color("text.base")}
          placeholderColor={color("text.faint")}
          cursorColor={color("text.accent")}
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
