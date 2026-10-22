/** A titled block: a heading in the accent, an optional note beside it, and its contents. */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";

import { useColor } from "../theme/theme.tsx";

export function Section(props: {
  readonly title: string;
  readonly note?: string;
  readonly children: JSX.Element;
}) {
  const color = useColor();

  return (
    <box marginBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={color("text.heading")} attributes={TextAttributes.BOLD}>
          {props.title}
        </text>
        <text fg={color("text.faint")}>{props.note ?? ""}</text>
      </box>
      {props.children}
    </box>
  );
}
