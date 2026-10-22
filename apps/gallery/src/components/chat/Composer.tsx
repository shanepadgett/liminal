/**
 * Where the user writes: queued inputs above, the draft in a textarea, and a line below with the
 * model, its effort and the keys that apply now.
 */

import { For } from "solid-js";

import { Hints } from "../../primitives/Hints.tsx";
import { useColor } from "../../theme/theme.tsx";

const DRAFT_ROWS = 6;

export function Composer(props: {
  readonly draft: string;
  readonly model: string;
  readonly effort: string;
  /** Inputs sent while a turn runs, waiting for it to end. */
  readonly queued: readonly string[];
  readonly isWorking: boolean;
}) {
  const color = useColor();

  return (
    <box flexShrink={0} paddingX={1}>
      <For each={props.queued}>
        {(input) => (
          <text wrapMode="none" paddingLeft={2} fg={color("text.faint")}>
            {`queued  ${input}`}
          </text>
        )}
      </For>
      <box
        border={["left"]}
        borderColor={color(props.isWorking ? "border.base" : "border.focus")}
        backgroundColor={color("surface.raised")}
        paddingX={1}
        paddingY={1}
      >
        <textarea
          initialValue={props.draft}
          placeholder="Ask anything   / for commands"
          placeholderColor={color("text.ghost")}
          textColor={color("text.base")}
          backgroundColor={color("surface.raised")}
          maxHeight={DRAFT_ROWS}
          wrapMode="word"
        />
      </box>
      <box flexDirection="row" paddingX={1}>
        <text flexGrow={1} wrapMode="none">
          <span style={{ fg: color("text.muted") }}>{props.model}</span>
          <span style={{ fg: color("text.faint") }}>{`  ${props.effort}`}</span>
        </text>
        <Hints
          hints={
            props.isWorking
              ? [
                  { keys: "enter", label: "queue" },
                  { keys: "esc", label: "stop" },
                ]
              : [
                  { keys: "enter", label: "send" },
                  { keys: "shift+enter", label: "new line" },
                ]
          }
        />
      </box>
    </box>
  );
}
