/** A narrow chat column drawn with one palette's roles, to judge the palette in use. */

import { ChatHeader } from "../chat/ChatHeader.tsx";
import { Composer } from "../chat/Composer.tsx";
import { Conversation } from "../chat/Conversation.tsx";
import { GLIDE } from "../chat/scan.ts";
import type { RoleColor } from "./roles.ts";

const SAMPLE_COLUMNS = 72;

export function Sample(props: { readonly color: RoleColor }) {
  return (
    <box
      backgroundColor={props.color("surface.base")}
      width={SAMPLE_COLUMNS}
      flexDirection="column"
    >
      <ChatHeader color={props.color} title="Plugin host" isWorking={false} />
      <Conversation color={props.color} />
      <Composer
        color={props.color}
        model="claude-opus-4"
        thinking="high"
        draft=""
        isWorking={false}
        motion={GLIDE}
      />
    </box>
  );
}
