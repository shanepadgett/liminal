/** A narrow chat column drawn with one palette's roles, to judge the palette in use. */

import type { RoleColor } from "@liminal/sdk/tui";

import { ChatHeader } from "../chat/ChatHeader.tsx";
import { Composer } from "../chat/Composer.tsx";
import { Conversation } from "../transcript/Conversation.tsx";
import { BOOT } from "../transcript/sample.ts";

const SAMPLE_COLUMNS = 72;
const SAMPLE_ROWS = 24;

export function Sample(props: { readonly color: RoleColor }) {
  return (
    <box
      backgroundColor={props.color("surface.base")}
      width={SAMPLE_COLUMNS}
      flexDirection="column"
    >
      <ChatHeader color={props.color} title="Plugin host" isWorking={false} />
      <box height={SAMPLE_ROWS}>
        <Conversation color={props.color} finished={[BOOT]} playing={[]} ms={0} />
      </box>
      <Composer
        color={props.color}
        model="claude-opus-4"
        thinking="high"
        approval="auto"
        draft=""
        isWorking={false}
        isGliding={false}
        form={undefined}
      />
    </box>
  );
}
