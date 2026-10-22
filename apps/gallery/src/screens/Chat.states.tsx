import type { JSX } from "@opentui/solid";

import { Composer } from "../components/chat/Composer.tsx";
import { Header } from "../components/chat/Header.tsx";
import { SAMPLE_MODEL } from "../components/chat/Sidebar.states.tsx";
import { Sidebar } from "../components/chat/Sidebar.tsx";
import { Toast } from "../components/chat/Toast.tsx";
import { MODELS } from "../components/dialogs/Models.states.tsx";
import { Picker, PICKER_HINTS } from "../components/dialogs/Picker.tsx";
import { Notice } from "../components/transcript/Notice.tsx";
import { Reply } from "../components/transcript/Reply.tsx";
import { ANSWER, EDITING, QUESTION, READING, STREAMING } from "../components/transcript/samples.ts";
import { Turn } from "../components/transcript/Turn.tsx";
import { WorkRows } from "../components/transcript/WorkRows.tsx";
import type { State } from "../entries.ts";
import { useColor } from "../theme/theme.tsx";
import { Chat } from "./Chat.tsx";

const TITLE = "Why the loop retries twice";

function Empty() {
  const color = useColor();

  return <text fg={color("text.faint")}>Ask anything to start. / opens the commands.</text>;
}

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
      <Reply text={STREAMING} isStreaming />
    </Turn>
  );
}

interface ChatSample {
  readonly title?: string;
  readonly transcript: () => JSX.Element;
  readonly isWorking?: boolean;
  readonly hasSidebar?: boolean;
  readonly dialog?: () => JSX.Element;
  readonly toast?: () => JSX.Element;
}

const chat = (sample: ChatSample) => () => (
  <Chat
    header={
      <Header
        title={sample.title}
        model={SAMPLE_MODEL.name}
        isWorking={sample.isWorking ?? false}
      />
    }
    transcript={sample.transcript()}
    composer={
      <Composer
        draft=""
        model={SAMPLE_MODEL.name}
        effort="high"
        queued={[]}
        isWorking={sample.isWorking ?? false}
      />
    }
    sidebar={
      sample.hasSidebar === true ? (
        <Sidebar
          title={TITLE}
          started="2h ago"
          model={SAMPLE_MODEL}
          used={86_000}
          limit={200_000}
        />
      ) : undefined
    }
    dialog={sample.dialog?.()}
    toast={sample.toast?.()}
  />
);

export const chatStates: readonly [State, ...State[]] = [
  { name: "New session", fill: "screen", view: chat({ transcript: () => <Empty /> }) },
  {
    name: "Conversation",
    fill: "screen",
    view: chat({ title: TITLE, transcript: () => <Answered />, hasSidebar: true }),
  },
  {
    name: "Working",
    fill: "screen",
    view: chat({ title: TITLE, transcript: () => <Working />, isWorking: true, hasSidebar: true }),
  },
  {
    name: "Model picker",
    fill: "screen",
    view: chat({
      title: TITLE,
      transcript: () => <Answered />,
      dialog: () => (
        <Picker
          title="Model for main"
          placeholder="Search models"
          empty="No models. Connect a provider first."
          rows={MODELS}
          query=""
          selected="anthropic/claude-sonnet-4.5"
          hints={PICKER_HINTS}
        />
      ),
    }),
  },
  {
    name: "Toast",
    fill: "screen",
    view: chat({
      title: TITLE,
      transcript: () => <Answered />,
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
