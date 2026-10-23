/**
 * A box over the screen: a title trailed by diagonals, its contents and the keys that apply, when
 * any do.
 */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { Show } from "solid-js";

import { useColor } from "../colors.ts";
import { Hatch } from "./Hatch.tsx";
import type { Hint } from "./hint-layout.ts";
import { Hints } from "./Hints.tsx";

const DIALOG_COLUMNS = 60;

/** Two border columns and two padding columns. */
const FRAME_COLUMNS = 4;

export function Dialog(props: {
  readonly title: string;
  readonly hints: readonly Hint[];
  readonly children: JSX.Element;
}) {
  const color = useColor();

  return (
    <box
      width={DIALOG_COLUMNS}
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={color("border.base")}
      backgroundColor={color("surface.overlay")}
      paddingX={1}
    >
      <box flexDirection="row" gap={1} marginBottom={1}>
        <text flexShrink={0} fg={color("text.heading")} attributes={TextAttributes.BOLD}>
          {props.title}
        </text>
        <Hatch width={DIALOG_COLUMNS - FRAME_COLUMNS - props.title.length - 1} />
      </box>
      {props.children}
      <Show when={props.hints.length > 0}>
        <box marginTop={1}>
          <Hints hints={props.hints} />
        </box>
      </Show>
    </box>
  );
}
