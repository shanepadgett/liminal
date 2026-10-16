/** The raised panel a tool call's body sits on, set in under its line. */

import type { JSX } from "@opentui/solid";

import type { RoleColor } from "../../tokens/roles.ts";

export const BODY_INDENT = 2;

export function Panel(props: { readonly color: RoleColor; readonly children: JSX.Element }) {
  return (
    <box
      flexDirection="column"
      marginLeft={BODY_INDENT}
      paddingX={1}
      backgroundColor={props.color("surface.raised")}
    >
      {props.children}
    </box>
  );
}

/** A faint line saying how much output the panel leaves out. */
export function MoreLines(props: { readonly color: RoleColor; readonly count: number }) {
  return (
    <text wrapMode="none" fg={props.color("text.ghost")}>
      {`… ${props.count} more lines`}
    </text>
  );
}

/** Line numbers padded to the widest, so the text after them lines up. */
export const gutter = (numbers: readonly number[]) => {
  const width = String(Math.max(...numbers)).length;

  return (number: number) => String(number).padStart(width);
};
