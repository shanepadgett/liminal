/**
 * Where the user writes. A full-width surface of its own holding the input and, right under it, the
 * model in the accent color with its thinking level. Its top row scans while the agent works. The
 * key hints sit directly below the surface.
 */

import type { RoleColor } from "../tokens/roles.ts";
import { type Hint, Hints } from "./Hints.tsx";
import type { ScanMotion } from "./scan.ts";
import { ScanLine } from "./ScanLine.tsx";

/** What the keys do depends on whether the agent is working and whether there is a draft. */
const hintsFor = (isWorking: boolean, hasDraft: boolean): readonly Hint[] => {
  if (isWorking) {
    return hasDraft
      ? [
          ["enter", "queue"],
          ["esc", "interrupt"],
        ]
      : [["esc", "interrupt"]];
  }

  return hasDraft
    ? [
        ["enter", "send"],
        ["shift+enter", "newline"],
      ]
    : [
        ["/", "commands"],
        ["ctrl+p", "palette"],
        ["ctrl+s", "sessions"],
      ];
};

const INPUT_ROWS = 2;

export function Composer(props: {
  readonly color: RoleColor;
  readonly model: string;
  readonly thinking: string;
  readonly draft: string;
  readonly isWorking: boolean;
  readonly motion: ScanMotion;
}) {
  const surface = () => props.color("surface.raised");

  return (
    <box flexDirection="column" flexShrink={0}>
      <box flexDirection="column" backgroundColor={surface()}>
        <ScanLine
          color={props.color}
          surface={surface()}
          isWorking={props.isWorking}
          motion={props.motion}
        />
        <box flexDirection="column" paddingX={2} paddingBottom={1}>
          <textarea
            height={INPUT_ROWS}
            initialValue={props.draft}
            placeholder="Ask anything, or / for commands"
            backgroundColor={surface()}
            focusedBackgroundColor={surface()}
            textColor={props.color("text.base")}
            focusedTextColor={props.color("text.base")}
            placeholderColor={props.color("text.faint")}
            cursorColor={props.color("text.accent")}
          />
          <text wrapMode="none">
            <span style={{ fg: props.color("text.accent") }}>{props.model}</span>
            <span style={{ fg: props.color("text.muted") }}>{` (${props.thinking})`}</span>
          </text>
        </box>
      </box>
      <box paddingX={2}>
        <Hints color={props.color} hints={hintsFor(props.isWorking, props.draft.length > 0)} />
      </box>
    </box>
  );
}
