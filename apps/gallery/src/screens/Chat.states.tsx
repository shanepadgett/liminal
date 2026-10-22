import type { JSX } from "@opentui/solid";

import { Approval, approvalHintsOf } from "../components/asks/Approval.tsx";
import { formHintsOf } from "../components/asks/form.ts";
import { Questions } from "../components/asks/Questions.tsx";
import { FORM_CHOOSING, SHELL_CALL, SHELL_INPUT } from "../components/asks/samples.ts";
import { Composer, type Queued } from "../components/chat/Composer.tsx";
import { Header } from "../components/chat/Header.tsx";
import { Landing } from "../components/chat/Landing.tsx";
import { CONNECTED, USAGE } from "../components/chat/Notifications.states.tsx";
import { Notifications } from "../components/chat/Notifications.tsx";
import { SAMPLE_SIDEBAR } from "../components/chat/Sidebar.states.tsx";
import { Sidebar } from "../components/chat/Sidebar.tsx";
import { SLASH_COMMANDS } from "../components/chat/SlashMenu.states.tsx";
import { SLASH_HINTS, SlashMenu } from "../components/chat/SlashMenu.tsx";
import { MODELS } from "../components/dialogs/Models.states.tsx";
import { Picker, PICKER_HINTS } from "../components/dialogs/Picker.tsx";
import { Checkpoint } from "../components/transcript/Checkpoint.tsx";
import { Memory } from "../components/transcript/Memory.tsx";
import { Notice } from "../components/transcript/Notice.tsx";
import { Reply } from "../components/transcript/Reply.tsx";
import {
  ANSWER,
  EDITING,
  QUESTION,
  READ,
  READING,
  SHORT_TERM_MEMORY,
} from "../components/transcript/samples.ts";
import { Prompt, Turn } from "../components/transcript/Turn.tsx";
import { WorkRows } from "../components/transcript/WorkRows.tsx";
import type { State } from "../entries.ts";
import type { Hint } from "../primitives/Hints.tsx";
import { Spinner } from "../primitives/Spinner.tsx";
import { Chat } from "./Chat.tsx";

const TITLE = "Why the loop retries twice";

const FOLLOW_UP = "Drop the retry in turn.ts and run the loop tests.";

const WAITING: readonly Queued[] = [
  { kind: "steer", text: "Skip the archive folder" },
  { kind: "follow-up", text: "Also rename the store to sessions" },
];

function Answered() {
  return (
    <>
      <Turn input={QUESTION}>
        <WorkRows rows={READ} />
        <Memory kind="short-term" text={SHORT_TERM_MEMORY} />
        <Reply text={ANSWER} />
      </Turn>
      <Checkpoint filesRead={6} />
      <Turn>
        <WorkRows rows={EDITING} />
        <Memory kind="long-term" text="Retries belong in recovery.ts, which reads retry-after" />
        <Notice kind="info" text="Switched to claude-opus-4.1." />
      </Turn>
    </>
  );
}

function Working() {
  return (
    <Turn>
      <WorkRows rows={READING} />
      <Spinner />
    </Turn>
  );
}

/** The reads done, and a shell call waiting for the user's yes. */
function Approving() {
  return (
    <Turn>
      <WorkRows
        rows={[...READ, { tool: SHELL_CALL.tool, input: SHELL_INPUT, status: "running" }]}
      />
    </Turn>
  );
}

interface ChatSample {
  /** Left out before the session starts, when the landing's wordmark stands in for the header. */
  readonly title?: string;
  /** Pins the screen's width, to show a small screen at any frame size. */
  readonly columns?: number;
  /** Whether the sidebar's drawer is open on a small screen. */
  readonly isSidebarOpen?: boolean;
  /** The latest turn's input, pinned above the transcript. */
  readonly pinned?: string;
  readonly transcript: () => JSX.Element;
  readonly isWorking?: boolean;
  readonly queued?: readonly Queued[];
  readonly dialog?: () => JSX.Element;
  readonly widgets?: () => JSX.Element;
  readonly draft?: string;
  /** The commands matching the draft's `/`. */
  readonly suggestions?: () => JSX.Element;
  readonly ask?: () => JSX.Element;
  readonly hints?: readonly Hint[];
}

const composerOf = (sample: ChatSample) => (
  <Composer
    draft={sample.draft ?? ""}
    model="claude-sonnet-4.5"
    effort="high"
    queued={sample.queued ?? []}
    isWorking={sample.isWorking ?? false}
    widgets={sample.widgets?.()}
    suggestions={sample.suggestions?.()}
    ask={sample.ask?.()}
    hints={sample.hints}
  />
);

/** The sidebar comes with the header, once the session starts. */
const chatOf = (sample: ChatSample) => (
  <Chat
    header={
      sample.title === undefined ? undefined : (
        <Header title={sample.title} isWorking={sample.isWorking ?? false} />
      )
    }
    pinned={sample.pinned === undefined ? undefined : <Prompt input={sample.pinned} />}
    transcript={sample.transcript()}
    composer={composerOf(sample)}
    sidebar={sample.title === undefined ? undefined : <Sidebar {...SAMPLE_SIDEBAR} />}
    isSidebarOpen={sample.isSidebarOpen ?? false}
    dialog={sample.dialog?.()}
  />
);

const chat = (sample: ChatSample) => () =>
  sample.columns === undefined ? (
    chatOf(sample)
  ) : (
    <box width={sample.columns} height="100%">
      {chatOf(sample)}
    </box>
  );

const modelPicker = () => (
  <Picker
    title="Model for main"
    placeholder="Search models"
    empty="No models. Connect a provider first."
    rows={MODELS}
    query=""
    selected="anthropic/claude-sonnet-4.5"
    hints={PICKER_HINTS}
  />
);

export const chatStates: readonly [State, ...State[]] = [
  {
    name: "New session",
    fill: "screen",
    view: chat({ transcript: () => <Landing version="v0.1.0" /> }),
  },
  {
    name: "Conversation",
    fill: "screen",
    view: chat({ title: TITLE, pinned: FOLLOW_UP, transcript: Answered }),
  },
  {
    name: "Working",
    fill: "screen",
    view: chat({
      title: TITLE,
      pinned: QUESTION,
      transcript: Working,
      isWorking: true,
      queued: WAITING,
    }),
  },
  {
    name: "Small screen",
    fill: "screen",
    view: chat({ title: TITLE, columns: 96, pinned: FOLLOW_UP, transcript: Answered }),
  },
  {
    name: "Sidebar drawer",
    fill: "screen",
    view: chat({
      title: TITLE,
      columns: 96,
      isSidebarOpen: true,
      pinned: FOLLOW_UP,
      transcript: Answered,
    }),
  },
  {
    name: "Model picker",
    fill: "screen",
    view: chat({ title: TITLE, pinned: FOLLOW_UP, transcript: Answered, dialog: modelPicker }),
  },
  {
    name: "Notifications",
    fill: "screen",
    view: chat({
      title: TITLE,
      pinned: QUESTION,
      transcript: Working,
      isWorking: true,
      queued: WAITING,
      widgets: () => <Notifications notifications={[USAGE, CONNECTED]} />,
    }),
  },
  {
    name: "Slash menu",
    fill: "screen",
    view: chat({
      title: TITLE,
      pinned: FOLLOW_UP,
      transcript: Answered,
      draft: "/",
      suggestions: () => <SlashMenu commands={SLASH_COMMANDS} typed="" under={0} />,
      hints: SLASH_HINTS,
    }),
  },
  {
    name: "Slash menu with widgets",
    fill: "screen",
    view: chat({
      title: TITLE,
      pinned: QUESTION,
      transcript: Working,
      isWorking: true,
      queued: WAITING,
      widgets: () => <Notifications notifications={[USAGE, CONNECTED]} />,
      draft: "/co",
      suggestions: () => <SlashMenu commands={SLASH_COMMANDS} typed="co" under={0} />,
      hints: SLASH_HINTS,
    }),
  },
  {
    name: "Approval",
    fill: "screen",
    view: chat({
      title: TITLE,
      pinned: QUESTION,
      transcript: Approving,
      isWorking: true,
      ask: () => <Approval call={SHELL_CALL} waiting={0} cursor={{ kind: "approve" }} />,
      hints: approvalHintsOf({ kind: "approve" }),
    }),
  },
  {
    name: "Questions",
    fill: "screen",
    view: chat({
      title: TITLE,
      pinned: QUESTION,
      transcript: Answered,
      ask: () => <Questions form={FORM_CHOOSING} />,
      hints: formHintsOf(FORM_CHOOSING),
    }),
  },
];
