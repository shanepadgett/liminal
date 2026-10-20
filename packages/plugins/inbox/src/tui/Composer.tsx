/**
 * Where the user writes: a raised surface with the input and, under it, the model in the accent
 * color with its thinking option. Enter sends; while a turn runs it steers the turn and Tab queues
 * a follow-up instead. Queued input shows above the input until the turn takes it. Ctrl+c clears
 * the draft, ctrl+s stashes it, ctrl+v adds the clipboard's picture, and `@` opens the tag list.
 */

import type { PasteEvent, TextareaRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import type { Accessor } from "solid-js";
import { createSignal, For, onCleanup, onMount, Show, untrack } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import {
  type Hint,
  Hints,
  SlotView,
  type TuiCommandsService,
  useBindings,
  useColor,
} from "@liminal/sdk/tui";

import { InboxSlots, type Queued, type SendMode, type UserInput } from "../contract.ts";
import { CommandMenu } from "./CommandMenu.tsx";
import { type ReadPicture, usePictures } from "./paste.ts";
import { useSlash } from "./slash.ts";
import type { Editor } from "./stash.tsx";
import { TagMenu } from "./TagMenu.tsx";
import { type TagsDeps, useTags } from "./tags.ts";

/**
 * The most rows the input grows to before it scrolls: a third of the terminal, at least six. A
 * blank row always stays under it, above the model line.
 */
const maxInputRows = (terminalRows: number) => Math.max(6, Math.floor(terminalRows / 3));

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
  readonly draft: (session: SessionId) => readonly [Accessor<string>, (text: string) => void];
  readonly send: (session: SessionId, input: UserInput, mode: SendMode) => void;
  readonly findTags: TagsDeps["find"];
  readonly readPicture: ReadPicture;
  /** Stashes `text`, calling `done` once it is safe. */
  readonly stash: (text: string, done: () => void) => void;
  /** Where `/pop` writes. */
  readonly editor: Editor;
  readonly queue: (session: SessionId) => Accessor<Queued>;
  /** The session's model line, or why no turn can start. */
  readonly model: (session: SessionId) => Accessor<ModelLine>;
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

function ModelLine(props: { readonly line: Accessor<ModelLine> }) {
  const color = useColor();
  const line = () => props.line();

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
  const lines = () => [...props.queued.steers, ...props.queued.followUps];

  return (
    <Show when={lines().length > 0}>
      <box flexDirection="column" marginBottom={1}>
        <For each={lines()}>
          {(text) => (
            <text wrapMode="none" fg={color("text.faint")}>
              {`↳ ${text}`}
            </text>
          )}
        </For>
      </box>
    </Show>
  );
}

/**
 * The textarea: enter and the keypad's enter submit, shift+enter starts a new line; it grows with
 * its text and starts with the kept draft.
 */
function Input(props: {
  readonly ref: (made: TextareaRenderable) => void;
  /** The textarea is gone, such as when a form takes its place. */
  readonly onGone: () => void;
  readonly initial: string;
  readonly focused: boolean;
  readonly onSubmit: () => void;
  readonly onChange: () => void;
  readonly onCursor: () => void;
  readonly onPaste: (event: PasteEvent) => void;
}) {
  const color = useColor();
  const surface = () => color("surface.raised");
  const terminal = useTerminalDimensions();
  let made: TextareaRenderable | undefined;

  // A kept draft goes on where it stopped.
  onMount(() => made?.gotoBufferEnd());
  onCleanup(props.onGone);

  return (
    <textarea
      ref={(each) => {
        made = each;
        props.ref(each);
      }}
      focused={props.focused}
      minHeight={1}
      marginBottom={1}
      maxHeight={maxInputRows(terminal().height)}
      initialValue={props.initial}
      placeholder="Ask anything"
      keyBindings={[
        { name: "return", action: "submit" },
        { name: "kpenter", action: "submit" },
        { name: "return", shift: true, action: "newline" },
      ]}
      onSubmit={props.onSubmit}
      onContentChange={props.onChange}
      onCursorChange={props.onCursor}
      onPaste={props.onPaste}
      backgroundColor={surface()}
      focusedBackgroundColor={surface()}
      textColor={color("text.base")}
      focusedTextColor={color("text.base")}
      placeholderColor={color("text.faint")}
      cursorColor={color("text.accent")}
    />
  );
}

/**
 * Clears the draft. With none, or under a dialog, it declines, so ctrl+c goes on to the next
 * binding.
 */
const clearDraft = (input: TextareaRenderable | undefined, underDialog: boolean) => {
  if (underDialog || input === undefined || input.plainText === "") return false;
  input.clear();

  return true;
};

/** While a turn runs, tab queues the draft as a follow-up. */
const queueKeys = (running: boolean) => (running ? [{ key: "tab", cmd: "inbox.queue" }] : []);

/** The keys of the list open above the input, if any; else tab's. */
const listKeys = <B,>(
  lists: ReadonlyArray<{ readonly open: () => boolean; readonly bindings: ReadonlyArray<B> }>,
  running: boolean,
) => lists.find((list) => list.open())?.bindings ?? queueKeys(running);

const editKeys = [
  { key: "ctrl+c", cmd: "inbox.clear" },
  { key: "ctrl+s", cmd: "inbox.stash" },
  { key: "ctrl+v", cmd: "inbox.paste-picture" },
];

/** The draft's keys: editing, esc on a lone `/word`, then the open list's or tab's. */
const draftKeys = (draft: ReturnType<typeof useDraft>, running: boolean) => [
  ...editKeys,
  ...draft.slash.clearKeys(),
  ...listKeys([draft.slash, draft.tags], running),
];

/** The model line with the plugins' items after it, then the last send's failure. */
function StatusLines(props: { readonly deps: ComposerDeps; readonly turn: TurnProps }) {
  const color = useColor();
  const line = props.deps.model(props.turn.sessionId);

  return (
    <>
      <box flexDirection="row" gap={2}>
        <ModelLine line={line} />
        <SlotView of={ChatSlots.composerLine} props={props.turn} />
      </box>
      <Show when={props.deps.problem() !== ""}>
        <text fg={color("feedback.danger")}>{props.deps.problem()}</text>
      </Show>
    </>
  );
}

/** The draft's own keys: clear, stash and paste a picture; each declines under a dialog. */
const editCommands = (
  deps: ComposerDeps,
  input: () => TextareaRenderable | undefined,
  fromClipboard: () => void,
) => [
  { name: "inbox.clear", run: () => clearDraft(input(), deps.dialogOpen()) },
  {
    name: "inbox.stash",
    run: () => {
      const text = input()?.plainText ?? "";
      if (deps.dialogOpen() || text.trim() === "") return false;
      deps.stash(text, () => input()?.clear());

      return true;
    },
  },
  {
    name: "inbox.paste-picture",
    run: () => {
      if (deps.dialogOpen()) return false;
      fromClipboard();

      return true;
    },
  },
];

/** The lists above the input: commands for a lone `/word`, tags for an `@` at the cursor. */
function Lists(props: {
  readonly slash: ReturnType<typeof useSlash>;
  readonly tags: ReturnType<typeof useTags>;
}) {
  return (
    <>
      <Show when={props.slash.open()}>
        <CommandMenu matches={props.slash.matches()} selected={props.slash.selected()} />
      </Show>
      <Show when={!props.slash.open() && props.tags.open()}>
        <TagMenu
          rows={props.tags.rows()}
          query={props.tags.query()}
          selected={props.tags.selected()}
        />
      </Show>
    </>
  );
}

/** The composer's input and lists, wired to the session's draft. */
const useDraft = (deps: ComposerDeps, props: TurnProps) => {
  const [draft, setDraft] = deps.draft(props.sessionId);
  const [cursor, setCursor] = createSignal(0);
  let input: TextareaRenderable | undefined;
  const current = () => input;
  const slash = useSlash({ commands: deps.commands, draft, input: current });
  const tags = useTags({ draft, cursor, input: current, find: deps.findTags });
  const pictures = usePictures(deps.readPicture, current);

  onCleanup(() => {
    deps.editor.release(input);
  });

  const use = (made: TextareaRenderable) => {
    input = made;
    deps.editor.use(made);
  };

  const drop = () => {
    deps.editor.release(input);
    input = undefined;
  };

  const follow = () => {
    setDraft(input?.plainText ?? "");
    setCursor(input?.cursorOffset ?? 0);
  };

  return { draft, current, use, drop, follow, slash, tags, pictures };
};

export const makeComposer = (deps: ComposerDeps) =>
  function Composer(props: TurnProps) {
    const color = useColor();
    const queued = deps.queue(props.sessionId);
    const draft = useDraft(deps, props);

    const send = (mode: SendMode) => {
      const text = draft.current()?.plainText.trim() ?? "";
      if (text === "") return;
      draft.current()?.clear();
      if (!draft.slash.submit(text)) deps.send(props.sessionId, draft.pictures.take(text), mode);
    };

    useBindings(() => ({
      commands: [
        ...draft.slash.commands,
        draft.slash.clearCommand,
        ...draft.tags.commands,
        {
          name: "inbox.queue",
          run: () => {
            send("follow-up");
          },
        },
        ...editCommands(deps, draft.current, draft.pictures.fromClipboard),
      ],
      bindings: draftKeys(draft, props.running),
    }));

    return (
      <box
        flexDirection="column"
        flexShrink={0}
        backgroundColor={color("surface.raised")}
        paddingX={2}
        paddingY={1}
      >
        <QueuedLines queued={queued()} />
        <SlotView
          of={InboxSlots.input}
          props={{ running: props.running, sessionId: props.sessionId }}
          fallback={
            <>
              <Lists slash={draft.slash} tags={draft.tags} />
              <Input
                ref={draft.use}
                onGone={draft.drop}
                initial={untrack(draft.draft)}
                focused={!deps.dialogOpen()}
                onSubmit={() => {
                  send("steer");
                }}
                onChange={draft.follow}
                onCursor={draft.follow}
                onPaste={draft.pictures.onPaste}
              />
            </>
          }
        />
        <StatusLines deps={deps} turn={props} />
      </box>
    );
  };

const hintsFor = (running: boolean, hasDraft: boolean): readonly Hint[] => {
  if (!hasDraft) return running ? [] : [["enter", "send"]];

  return running
    ? [
        ["enter", "steer"],
        ["tab", "queue"],
        ["ctrl+s", "stash"],
      ]
    : [
        ["enter", "send"],
        ["shift+enter", "newline"],
        ["ctrl+s", "stash"],
      ];
};

export const makeHints = (deps: ComposerDeps) =>
  function ComposerHints(props: TurnProps) {
    const color = useColor();
    const [draft] = deps.draft(props.sessionId);

    return <Hints color={color} hints={hintsFor(props.running, draft().trim() !== "")} />;
  };
