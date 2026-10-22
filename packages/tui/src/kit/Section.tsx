/** A titled block: the title, a rule running out to the edge with a note at its end, and contents. */

import type { JSX } from "@opentui/solid";
import { Show } from "solid-js";

import type { RoleName } from "@shanepadgett/liminal-theme/contract";

import { useColor } from "../colors.ts";

export function Section(props: {
  readonly title: string;
  readonly note?: string;
  /** The note's color; faint unless the note needs attention. */
  readonly noteRole?: RoleName;
  readonly children?: JSX.Element;
}) {
  const color = useColor();

  return (
    <box marginBottom={1}>
      <box flexDirection="row" gap={1}>
        <text flexShrink={0} fg={color("text.heading")}>
          {props.title}
        </text>
        <box flexGrow={1} height={1} border={["bottom"]} borderColor={color("border.subtle")} />
        <Show when={props.note}>
          {(note) => (
            <text flexShrink={0} fg={color(props.noteRole ?? "text.faint")}>
              {note()}
            </text>
          )}
        </Show>
      </box>
      {props.children}
    </box>
  );
}
