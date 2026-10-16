/**
 * A panel centered over the whole window, on the raised surface above a dimmed chat. Its title row
 * is drawn like the chat header: the title in the accent, then hairlines thickening into the fade,
 * then `esc`. Key hints close the panel at the bottom. It sits above the sidebar drawer.
 */

import type { JSX } from "@opentui/solid";

import { HeaderRule } from "../ornament/HeaderRule.tsx";
import type { RoleColor } from "../tokens/roles.ts";
import { type Hint, Hints } from "./Hints.tsx";
import { SCRIM } from "./scrim.ts";

/** The dialog's width, unless the window is narrower. */
const DIALOG_COLUMNS = 60;

/** Above the sidebar drawer, which is at 1. */
const Z_INDEX = 10;

export function Dialog(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly hints: readonly Hint[];
  readonly children: JSX.Element;
}) {
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={Z_INDEX}
      alignItems="center"
      justifyContent="center"
      backgroundColor={SCRIM}
    >
      <box
        width={DIALOG_COLUMNS}
        maxWidth="100%"
        maxHeight="100%"
        flexDirection="column"
        gap={1}
        paddingX={2}
        paddingY={1}
        backgroundColor={props.color("surface.raised")}
      >
        <box flexDirection="row" flexShrink={0}>
          <text flexShrink={0} wrapMode="none" fg={props.color("text.accent")}>
            {`${props.title} `}
          </text>
          <HeaderRule color={props.color} surface="surface.raised" isWorking={false} />
          <text flexShrink={0} fg={props.color("text.faint")}>
            {" esc"}
          </text>
        </box>
        {props.children}
        <box flexShrink={0}>
          <Hints color={props.color} hints={props.hints} />
        </box>
      </box>
    </box>
  );
}
