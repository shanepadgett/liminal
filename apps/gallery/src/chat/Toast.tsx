/**
 * A short notice about something just done in the TUI, in the top right of the chat column, under
 * the header. A thin bar on its left edge carries the kind's color; the title is bold in that
 * color, the message muted beneath it. Every kind times out, errors included; the timer pauses
 * while the mouse is over it, and its text is selectable to copy. What happens in a session is a
 * transcript notice, not a toast.
 */

import { TextAttributes } from "@opentui/core";
import { Show } from "solid-js";

import { EDGE_BAR, type RoleColor } from "@liminal/sdk/tui";

import { NOTICE_ROLES, type NoticeKind } from "../transcript/Notice.tsx";

export type ToastMessage = {
  readonly kind: NoticeKind;
  readonly title: string;
  readonly message?: string;
};

const TOAST_COLUMNS = 48;

export function Toast(props: { readonly color: RoleColor; readonly toast: ToastMessage }) {
  const accent = () => props.color(NOTICE_ROLES[props.toast.kind]);

  return (
    <box
      width={TOAST_COLUMNS}
      maxWidth="100%"
      flexDirection="column"
      border={["left"]}
      customBorderChars={EDGE_BAR}
      borderColor={accent()}
      backgroundColor={props.color("surface.overlay")}
      paddingX={2}
      paddingY={1}
    >
      <text fg={accent()} attributes={TextAttributes.BOLD}>
        {props.toast.title}
      </text>
      <Show when={props.toast.message}>
        {(message) => <text fg={props.color("text.muted")}>{message()}</text>}
      </Show>
    </box>
  );
}
