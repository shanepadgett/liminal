/** One turn: what the user sent, then everything the reply did. */

import type { JSX } from "@opentui/solid";

import { useColor } from "../../theme/theme.tsx";

export function Turn(props: { readonly input: string; readonly children: JSX.Element }) {
  const color = useColor();

  return (
    <box flexShrink={0} gap={1} marginBottom={1}>
      <box
        border={["left"]}
        borderColor={color("text.accent")}
        backgroundColor={color("surface.raised")}
        paddingX={1}
      >
        <text fg={color("text.base")}>{props.input}</text>
      </box>
      <box gap={1} paddingLeft={2}>
        {props.children}
      </box>
    </box>
  );
}
