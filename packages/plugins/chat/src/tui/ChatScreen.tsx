/**
 * The chat screen: the header (wordmark, hairlines that glide while a turn runs, then the header
 * items), the transcript, the composer and the key hints, in a column filling the terminal.
 */

import type { Accessor } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import { HeaderRule, SlotView, useColor } from "@liminal/sdk/tui";

import { ChatSlots } from "../contract.ts";
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

export function ChatScreen(props: {
  readonly sessionId: SessionId;
  readonly transcript: Accessor<TranscriptState>;
}) {
  const color = useColor();
  const turn = () => ({ sessionId: props.sessionId, running: props.transcript().running });

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={color("surface.base")}>
      <Header running={turn().running} />
      <box flexGrow={1} minHeight={0}>
        <Transcript sessionId={props.sessionId} transcript={props.transcript} />
      </box>
      <SlotView of={ChatSlots.composer} props={turn()} />
      <box flexDirection="row" flexShrink={0} paddingX={PADDING_X} gap={3}>
        <SlotView of={ChatSlots.hints} props={turn()} />
      </box>
    </box>
  );
}
