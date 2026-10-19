/**
 * The chat screen: the header (wordmark, hairlines that glide while a turn runs, then the header
 * items), the transcript, the composer and the key hints, in a column filling the terminal, with
 * the current toast in its top right, and the session sidebar on the right. Switching sessions
 * draws the session's parts afresh.
 */

import { useTerminalDimensions } from "@opentui/solid";
import { type Accessor, createEffect, createMemo, Show } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import { HeaderRule, SlotView, type TuiToastsService, useColor } from "@liminal/sdk/tui";

import { ChatSlots } from "../contract.ts";
import { Sidebar, type SidebarState } from "./Sidebar.tsx";
import { ToastCorner } from "./Toast.tsx";
import type { Transcript as TranscriptState } from "./transcript-state.ts";
import { Transcript } from "./Transcript.tsx";

const WORDMARK = "liminal ";

const PADDING_X = 2;

function Header(props: { readonly running: boolean }) {
  const color = useColor();

  return (
    <box flexDirection="row" flexShrink={0} paddingX={PADDING_X} paddingTop={1}>
      <text fg={color("text.accent")} flexShrink={0}>
        {WORDMARK}
      </text>
      <HeaderRule color={color} surface="surface.base" isWorking={props.running} />
      <SlotView of={ChatSlots.header} props={{}} />
    </box>
  );
}

interface ScreenProps {
  readonly sessionId: SessionId;
  readonly transcript: Accessor<TranscriptState>;
  /** Whether debug entries draw. */
  readonly debug: Accessor<boolean>;
}

/** The transcript, composer and hints of one session. */
function SessionView(props: ScreenProps & { readonly running: boolean }) {
  const turn = () => ({ sessionId: props.sessionId, running: props.running });

  return (
    <>
      <box flexGrow={1} minHeight={0}>
        <Transcript sessionId={props.sessionId} transcript={props.transcript} debug={props.debug} />
      </box>
      <SlotView of={ChatSlots.composer} props={turn()} />
      <box flexDirection="row" flexShrink={0} paddingX={PADDING_X} gap={3}>
        <SlotView of={ChatSlots.composerHints} props={turn()} />
        <SlotView of={ChatSlots.hints} props={turn()} />
      </box>
    </>
  );
}

export function ChatScreen(
  props: ScreenProps & { readonly toasts: TuiToastsService; readonly sidebar: SidebarState },
) {
  const color = useColor();
  const terminal = useTerminalDimensions();
  // A memo, so the parts that take `running` see a change only when a turn starts or ends, not on
  // every streamed delta.
  const running = createMemo(() => props.transcript().running);

  createEffect(() => {
    props.sidebar.setColumns(terminal().width);
  });

  return (
    <box flexDirection="row" width="100%" height="100%" backgroundColor={color("surface.base")}>
      <box flexDirection="column" flexGrow={1} minWidth={0}>
        <Header running={running()} />
        <Show when={props.sessionId} keyed>
          {(sessionId) => (
            <SessionView
              sessionId={sessionId}
              transcript={props.transcript}
              debug={props.debug}
              running={running()}
            />
          )}
        </Show>
        <ToastCorner toasts={props.toasts} />
      </box>
      <Show when={props.sessionId} keyed>
        {(sessionId) => <Sidebar sessionId={sessionId} state={props.sidebar} />}
      </Show>
    </box>
  );
}
