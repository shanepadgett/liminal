/** A narrow chat column drawn with one palette's roles, to judge the palette in use. */

import { ChatHeader } from "../chat/ChatHeader.tsx";
import { Composer } from "../chat/Composer.tsx";
import { FINISHED_SESSION } from "../transcript/sample.ts";
import { FOLDED } from "../transcript/styles.ts";
import { Transcript } from "../transcript/Transcript.tsx";
import type { RoleColor } from "./roles.ts";

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
        <Transcript
          color={props.color}
          session={FINISHED_SESSION}
          style={FOLDED}
          isWorking={false}
          openIds={new Set()}
        />
      </box>
      <Composer
        color={props.color}
        model="claude-opus-4"
        thinking="high"
        draft=""
        isWorking={false}
        isGliding={false}
        form={undefined}
      />
    </box>
  );
}
