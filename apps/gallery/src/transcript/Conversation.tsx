/**
 * A session at one moment: the finished turns, then the turns played one after another, each shown
 * once it has begun, scrolled so the newest line stays in view.
 */

import { Index } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { durationOf, frameAt, turnsAt } from "./play.ts";
import type { Script } from "./script.ts";
import { Turn } from "./Turn.tsx";

export function Conversation(props: {
  readonly color: RoleColor;
  readonly finished: readonly Script[];
  readonly playing: readonly Script[];
  readonly ms: number;
}) {
  const turns = () => [
    ...props.finished.map((script) => ({ script, ms: durationOf(script) })),
    ...turnsAt(props.playing, props.ms),
  ];

  return (
    <box width="100%" height="100%" backgroundColor={props.color("surface.base")}>
      <scrollbox
        flexGrow={1}
        stickyScroll
        stickyStart="bottom"
        scrollbarOptions={{ visible: false }}
      >
        <box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
          <Index each={turns()}>
            {(turn) => (
              <Turn
                color={props.color}
                prompt={turn().script.prompt}
                frame={frameAt(turn().script, turn().ms)}
              />
            )}
          </Index>
        </box>
      </scrollbox>
    </box>
  );
}
