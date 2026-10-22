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
  /** A wide screen has room for the sidebar. */
  readonly width: "wide" | "narrow";
  /** The latest turn's input, pinned above the transcript. */
  readonly pinned?: string;
  readonly transcript: () => JSX.Element;
  readonly isWorking?: boolean;
  readonly queued?: readonly Queued[];
  readonly dialog?: () => JSX.Element;
  readonly widgets?: () => JSX.Element;
  readonly ask?: () => JSX.Element;
  readonly hints?: readonly Hint[];
}

const chat = (sample: ChatSample) => () => (
  <Chat
    header={
      sample.title === undefined ? undefined : (
        <Header title={sample.title} isWorking={sample.isWorking ?? false} />
      )
    }
    pinned={sample.pinned === undefined ? undefined : <Prompt input={sample.pinned} isPinned />}
    transcript={sample.transcript()}
    composer={
      <Composer
        draft=""
        model="claude-sonnet-4.5"
        effort="high"
        queued={sample.queued ?? []}
        isWorking={sample.isWorking ?? false}
        widgets={sample.widgets?.()}
        ask={sample.ask?.()}
        hints={sample.hints}
      />
    }
    sidebar={sample.width === "wide" ? <Sidebar {...SAMPLE_SIDEBAR} /> : undefined}
    dialog={sample.dialog?.()}
  />
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
    view: chat({ width: "narrow", transcript: () => <Landing version="v0.1.0" /> }),
  },
  {
    name: "Conversation",
    fill: "screen",
    view: chat({ title: TITLE, width: "wide", pinned: FOLLOW_UP, transcript: Answered }),
  },
  {
    name: "Working",
    fill: "screen",
    view: chat({
      title: TITLE,
      width: "wide",
      pinned: QUESTION,
      transcript: Working,
      isWorking: true,
      queued: WAITING,
    }),
  },
  {
    name: "Narrow",
    fill: "screen",
    view: chat({ title: TITLE, width: "narrow", pinned: FOLLOW_UP, transcript: Answered }),
  },
  {
    name: "Model picker",
    fill: "screen",
    view: chat({
      title: TITLE,
      width: "wide",
      pinned: FOLLOW_UP,
      transcript: Answered,
      dialog: modelPicker,
    }),
  },
  {
    name: "Notifications",
    fill: "screen",
    view: chat({
      title: TITLE,
      width: "wide",
      pinned: QUESTION,
      transcript: Working,
      isWorking: true,
      queued: WAITING,
      widgets: () => <Notifications notifications={[USAGE, CONNECTED]} />,
    }),
  },
  {
    name: "Approval",
    fill: "screen",
    view: chat({
      title: TITLE,
      width: "wide",
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
      width: "wide",
      pinned: QUESTION,
      transcript: Answered,
      ask: () => <Questions form={FORM_CHOOSING} />,
      hints: formHintsOf(FORM_CHOOSING),
    }),
  },
];
