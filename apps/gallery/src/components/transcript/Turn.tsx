/** One turn: what the user sent, behind the composer's chevron, then everything the reply did. */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { Show } from "solid-js";

import { useColor } from "../../theme/theme.tsx";
import { PROMPT } from "../chat/Composer.tsx";

/**
 * What the user sent. In the transcript it wraps; pinned under the header it keeps to one line so
 * the transcript keeps its room.
 */
export function Prompt(props: { readonly input: string; readonly isPinned?: boolean }) {
  const color = useColor();

  return (
    <box flexDirection="row" flexShrink={0}>
      <text width={3} flexShrink={0} fg={color("text.accent")} attributes={TextAttributes.BOLD}>
        {PROMPT}
      </text>
      <text fg={color("text.base")} wrapMode={props.isPinned === true ? "none" : "word"}>
        {props.input}
      </text>
    </box>
  );
}

export function Turn(props: {
  /** Left out for the latest turn, whose input is pinned under the header instead. */
  readonly input?: string;
  readonly children: JSX.Element;
}) {
  return (
    <box flexShrink={0} gap={1} marginBottom={1}>
      <Show when={props.input}>{(input) => <Prompt input={input()} />}</Show>
      <box gap={1} paddingLeft={3}>
        {props.children}
      </box>
    </box>
  );
}
