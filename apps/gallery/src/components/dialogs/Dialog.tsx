/** A box over the screen with a title, its contents and the keys that apply. */

import type { JSX } from "@opentui/solid";

import { type Hint, Hints } from "../../primitives/Hints.tsx";
import { useColor } from "../../theme/theme.tsx";

const DIALOG_COLUMNS = 60;

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
      title={` ${props.title} `}
      titleColor={color("text.heading")}
      paddingX={1}
      paddingTop={1}
    >
      {props.children}
      <box marginTop={1}>
        <Hints hints={props.hints} />
      </box>
    </box>
  );
}
