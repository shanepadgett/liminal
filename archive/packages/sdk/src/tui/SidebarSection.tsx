/**
 * The pieces of a sidebar section: its bold title over its lines, a stat with its label on the left
 * and its value on the right, a field with its value after a colon, and a muted note for a section
 * with nothing to show yet.
 */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";

import { useColor } from "./theme.ts";
import type { RoleName } from "./tokens/roles.ts";

/** A section's title in the heading color, its lines under it after a blank line. */
export function SidebarSection(props: { readonly title: string; readonly children: JSX.Element }) {
  const color = useColor();

  return (
    <box flexDirection="column" flexShrink={0}>
      <text fg={color("text.heading")} attributes={TextAttributes.BOLD} wrapMode="none">
        {props.title}
      </text>
      <box flexDirection="column" marginTop={1}>
        {props.children}
      </box>
    </box>
  );
}

/**
 * A label on the left and its value on the right; `tone` colors the value, the base text unless
 * given.
 */
export function SidebarStat(props: {
  readonly label: string;
  readonly value: string;
  readonly tone?: RoleName;
}) {
  const color = useColor();

  return (
    <box flexDirection="row" height={1}>
      <text wrapMode="none" flexGrow={1} fg={color("text.muted")}>
        {props.label}
      </text>
      <text wrapMode="none" flexShrink={0} fg={color(props.tone ?? "text.base")}>
        {props.value}
      </text>
    </box>
  );
}

/**
 * A label and its value side by side, `label: value`, for a section whose labels and values would
 * sit far apart as a stat. `tone` colors the value like `SidebarStat`.
 */
export function SidebarField(props: {
  readonly label: string;
  readonly value: string;
  readonly tone?: RoleName;
}) {
  const color = useColor();

  return (
    <box flexDirection="row" height={1}>
      <text wrapMode="none" flexShrink={0} fg={color("text.muted")}>
        {`${props.label}: `}
      </text>
      <text wrapMode="none" flexShrink={0} fg={color(props.tone ?? "text.base")}>
        {props.value}
      </text>
    </box>
  );
}

/** A muted line, such as `No model call yet`. */
export function SidebarNote(props: { readonly text: string }) {
  const color = useColor();

  return (
    <text wrapMode="none" truncate fg={color("text.muted")}>
      {props.text}
    </text>
  );
}

const THOUSAND = 1000;
const MILLION = 1_000_000;

/** A token count as `840`, `84K` or `1.2M`. */
export const formatTokens = (tokens: number): string => {
  if (tokens < THOUSAND) return String(tokens);
  if (tokens < MILLION) return `${Math.round(tokens / THOUSAND)}K`;

  return `${(tokens / MILLION).toFixed(1)}M`;
};

const PERCENT = 100;

/** A share from 0 to 1 as a whole percent, such as `42%`. */
export const formatShare = (share: number): string => `${Math.round(share * PERCENT)}%`;
