import type { JSX } from "@opentui/solid";

import { Composer } from "../components/chat/Composer.tsx";
import { Header } from "../components/chat/Header.tsx";
import { Landing } from "../components/chat/Landing.tsx";
import { SAMPLE_SIDEBAR } from "../components/chat/Sidebar.states.tsx";
import { Sidebar } from "../components/chat/Sidebar.tsx";
import { Toast } from "../components/chat/Toast.tsx";
import { MODELS } from "../components/dialogs/Models.states.tsx";
import { Picker, PICKER_HINTS } from "../components/dialogs/Picker.tsx";
import { Notice } from "../components/transcript/Notice.tsx";
import { Reply } from "../components/transcript/Reply.tsx";
import { ANSWER, EDITING, QUESTION, READING } from "../components/transcript/samples.ts";
import { Turn } from "../components/transcript/Turn.tsx";
import { WorkRows } from "../components/transcript/WorkRows.tsx";
import type { State } from "../entries.ts";
import { Spinner } from "../primitives/Spinner.tsx";
import { Chat } from "./Chat.tsx";

const TITLE = "Why the loop retries twice";

function Answered() {
  return (
    <>
      <Turn input={QUESTION}>
        <WorkRows rows={READING.map((row) => ({ ...row, status: "done" }))} />
        <Reply text={ANSWER} isStreaming={false} />
      </Turn>
      <Turn input="Drop the retry in turn.ts and run the loop tests.">
        <WorkRows rows={EDITING} />
        <Notice kind="info" text="Switched to claude-opus-4.1." />
      </Turn>
    </>
  );
}

function Working() {
  return (
    <Turn input={QUESTION}>
      <WorkRows rows={READING} />
      <Spinner label="Thinking" />
    </Turn>
  );
}

interface ChatSample {
  /** Left out before the session starts, when the landing's wordmark stands in for the header. */
  readonly title?: string;
  /** A wide screen has room for the sidebar. */
  readonly width: "wide" | "narrow";
  readonly transcript: () => JSX.Element;
  readonly isWorking?: boolean;
  readonly queued?: readonly string[];
  readonly dialog?: () => JSX.Element;
  readonly toast?: () => JSX.Element;
}

const chat = (sample: ChatSample) => () => (
  <Chat
    header={
      sample.title === undefined ? undefined : (
        <Header title={sample.title} isWorking={sample.isWorking ?? false} />
      )
    }
    transcript={sample.transcript()}
    composer={
      <Composer
        draft=""
        model="claude-sonnet-4.5"
        effort="high"
        queued={sample.queued ?? []}
        isWorking={sample.isWorking ?? false}
      />
    }
    sidebar={sample.width === "wide" ? <Sidebar {...SAMPLE_SIDEBAR} /> : undefined}
    dialog={sample.dialog?.()}
    toast={sample.toast?.()}
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
    view: chat({ title: TITLE, width: "wide", transcript: Answered }),
  },
  {
    name: "Working",
    fill: "screen",
    view: chat({
      title: TITLE,
      width: "wide",
      transcript: Working,
      isWorking: true,
      queued: ["Also rename the store to sessions"],
    }),
  },
  {
    name: "Narrow",
    fill: "screen",
    view: chat({ title: TITLE, width: "narrow", transcript: Answered }),
  },
  {
    name: "Model picker",
    fill: "screen",
    view: chat({ title: TITLE, width: "wide", transcript: Answered, dialog: modelPicker }),
  },
  {
    name: "Toast",
    fill: "screen",
    view: chat({
      title: TITLE,
      width: "wide",
      transcript: Answered,
      toast: () => (
        <Toast
          kind="success"
          title="Connected to OpenRouter"
          message="Its models are in the picker."
        />
      ),
    }),
  },
];
