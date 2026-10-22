/**
 * Notifications as widgets stacked above the composer. Each is one band tinted with its kind's
 * color, its mark in the composer's gutter column so the stack reads as part of the composer, and a
 * short track on the right that empties as it nears dismissal.
 */

import { TextAttributes } from "@opentui/core";
import { For, Show } from "solid-js";

import { mixHex } from "../../theme/oklch.ts";
import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";
export type NotificationKind = "info" | "success" | "warning" | "error";

export interface Notification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly message?: string;
  /** Share of its time on screen left, from 1 when it arrives to 0 as it goes. */
  readonly remaining: number;
}

const MARK: Readonly<
  Record<NotificationKind, { readonly glyph: string; readonly role: RoleName }>
> = {
  info: { glyph: "i", role: "feedback.info" },
  success: { glyph: "✓", role: "feedback.success" },
  warning: { glyph: "!", role: "feedback.warning" },
  error: { glyph: "×", role: "feedback.danger" },
};

/** How much of the kind's color tints the band, over the raised surface. */
const TINT = 0.24;

const TRACK_CELLS = 6;

/** The composer's gutter, so the marks line up with its prompt. */
const GUTTER_COLUMNS = 3;

function Track(props: { readonly remaining: number; readonly role: RoleName }) {
  const color = useColor();
  const filled = () => Math.round(Math.min(1, Math.max(0, props.remaining)) * TRACK_CELLS);

  return (
    <text flexShrink={0}>
      <span style={{ fg: color(props.role) }}>{"━".repeat(filled())}</span>
      <span style={{ fg: color("border.subtle") }}>{"━".repeat(TRACK_CELLS - filled())}</span>
    </text>
  );
}

function Band(props: { readonly notification: Notification }) {
  const color = useColor();
  const mark = () => MARK[props.notification.kind];

  return (
    <box
      flexDirection="row"
      marginX={-1}
      paddingX={1}
      gap={1}
      backgroundColor={mixHex(color("surface.raised"), color(mark().role), TINT)}
    >
      <text
        width={GUTTER_COLUMNS - 1}
        flexShrink={0}
        fg={color(mark().role)}
        attributes={TextAttributes.BOLD}
      >
        {mark().glyph}
      </text>
      <text flexGrow={1} flexShrink={1} wrapMode="none">
        <span style={{ fg: color("text.base") }}>{props.notification.title}</span>
        <Show when={props.notification.message}>
          {(message) => <span style={{ fg: color("text.muted") }}>{`  ${message()}`}</span>}
        </Show>
      </text>
      <Track remaining={props.notification.remaining} role={mark().role} />
    </box>
  );
}

export function Notifications(props: { readonly notifications: readonly Notification[] }) {
  return (
    <box flexShrink={0}>
      <For each={props.notifications}>{(notification) => <Band notification={notification} />}</For>
    </box>
  );
}
