/** One turn of the conversation on its own at one moment: what the user sent, then the reply. */

import { createSignal } from "solid-js";

import type { RoleColor } from "@liminal/sdk/tui";

import type { TurnFrame } from "./frame.ts";
import { Reply } from "./Reply.tsx";
import type { Prompt } from "./script.ts";
import { Sent } from "./Sent.tsx";

export function Turn(props: {
  readonly color: RoleColor;
  readonly prompt: Prompt;
  readonly frame: TurnFrame;
}) {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <box flexDirection="column">
      <Sent
        color={props.color}
        prompt={props.prompt}
        isOpen={isOpen()}
        isPinned={false}
        onToggle={() => setIsOpen((was) => !was)}
      />
      <Reply color={props.color} frame={props.frame} />
    </box>
  );
}
