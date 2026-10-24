/**
 * A box over the screen: a title trailed by diagonals, its contents and a footer row for the keys
 * that apply. The row stays when no key applies, so the dialog keeps its height as keys come and
 * go. While it asks before a destructive action, the question and its two keys take the row, the
 * question cut short when it cannot fit.
 */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { Show } from "solid-js";

import { useColor } from "../colors.ts";
import type { Confirming } from "./Confirm.tsx";
import { Hatch } from "./Hatch.tsx";
import type { Hint } from "./hint-layout.ts";
import { Hints } from "./Hints.tsx";

const DIALOG_COLUMNS = 60;

/** Two border columns and two padding columns. */
const FRAME_COLUMNS = 4;

export function Dialog(props: {
  readonly title: string;
  readonly hints: readonly Hint[];
  readonly confirming?: Confirming | undefined;
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
      <box marginTop={1} minHeight={1}>
        <Show when={props.confirming} fallback={<Hints hints={props.hints} />}>
          {(asked) => (
            <box flexDirection="row" gap={2}>
              <text flexShrink={1} wrapMode="none" truncate fg={color("feedback.danger")}>
                {asked().question}
              </text>
              <text flexShrink={0}>
                <span style={{ fg: color("text.muted") }}>enter</span>
                <span style={{ fg: color("text.faint") }}> yes</span>
                <span style={{ fg: color("text.muted") }}>{"   esc"}</span>
                <span style={{ fg: color("text.faint") }}> no</span>
              </text>
            </box>
          )}
        </Show>
      </box>
    </box>
  );
}
