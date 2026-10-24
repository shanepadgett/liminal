/**
 * Notifications as bands stacked above the composer. Each is tinted with its kind's color, its mark
 * in the composer's gutter column so the stack reads as part of the composer, and a short track on
 * the right that empties as it nears leaving.
 */
import { TextAttributes } from "@opentui/core";
import { Index, Show } from "solid-js";

import type { RoleName } from "@shanepadgett/liminal-client";

import { useColor, useMix } from "../colors.ts";
import type { NotificationKind, ShownNotification } from "../notifications.ts";

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

function Band(props: { readonly notification: ShownNotification }) {
  const color = useColor();
  const mix = useMix();
  const mark = () => MARK[props.notification.kind];

  return (
    <box
      flexDirection="row"
      marginX={-1}
      paddingX={1}
      gap={1}
      backgroundColor={mix(color("surface.raised"), color(mark().role), TINT)}
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

export function NotificationList(props: {
  readonly notifications: ReadonlyArray<ShownNotification>;
}) {
  return (
    <box flexShrink={0}>
      {/* By place, so a band redraws in place as its track shortens. */}
      <Index each={props.notifications}>
        {(notification) => <Band notification={notification()} />}
      </Index>
    </box>
  );
}
