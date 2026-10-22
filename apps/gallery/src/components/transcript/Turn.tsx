/** One turn: what the user sent, behind the composer's chevron, then everything the reply did. */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";

import { useColor } from "../../theme/theme.tsx";
import { PROMPT } from "../chat/Composer.tsx";

export function Turn(props: { readonly input: string; readonly children: JSX.Element }) {
  const color = useColor();

  return (
    <box flexShrink={0} gap={1} marginBottom={1}>
      <box flexDirection="row">
        <text width={3} flexShrink={0} fg={color("text.accent")} attributes={TextAttributes.BOLD}>
          {PROMPT}
        </text>
        <text fg={color("text.base")}>{props.input}</text>
      </box>
      <box gap={1} paddingLeft={3}>
        {props.children}
      </box>
    </box>
  );
}
