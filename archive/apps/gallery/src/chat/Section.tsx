/** A section title: bold, in the heading color, with nothing after it. */

import { TextAttributes } from "@opentui/core";

import type { RoleColor } from "@liminal/sdk/tui";

export function Section(props: { readonly color: RoleColor; readonly title: string }) {
  return (
    <text fg={props.color("text.heading")} attributes={TextAttributes.BOLD} wrapMode="none">
      {props.title}
    </text>
  );
}
