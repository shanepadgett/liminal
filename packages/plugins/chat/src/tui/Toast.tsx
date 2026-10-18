/**
 * The current toast, in the top right of the chat column one row under the header. A thin bar on
 * its left edge carries the kind's color; the title is bold in that color, the message muted
 * beneath it. Its text is selectable; the timer stops while the mouse is over it.
 */

import { TextAttributes } from "@opentui/core";
import { Show } from "solid-js";

import {
  EDGE_BAR,
  type RoleName,
  type ToastKind,
  type TuiToastsService,
  useColor,
} from "@liminal/sdk/tui";

const ROLES: Readonly<Record<ToastKind, RoleName>> = {
  info: "feedback.info",
  success: "feedback.success",
  warning: "feedback.warning",
  error: "feedback.danger",
};

const TOAST_COLUMNS = 48;

/** The header's rows, then one blank row. */
const TOP = 3;

/** Over the transcript, under dialogs. */
const Z_INDEX = 5;

export function ToastCorner(props: { readonly toasts: TuiToastsService }) {
  const color = useColor();

  return (
    <Show when={props.toasts.current()}>
      {(toast) => (
        <box
          position="absolute"
          top={TOP}
          right={2}
          zIndex={Z_INDEX}
          width={TOAST_COLUMNS}
          maxWidth="100%"
          flexDirection="column"
          border={["left"]}
          customBorderChars={EDGE_BAR}
          borderColor={color(ROLES[toast().kind])}
          backgroundColor={color("surface.overlay")}
          paddingX={2}
          paddingY={1}
          onMouseOver={() => {
            props.toasts.hold(true);
          }}
          onMouseOut={() => {
            props.toasts.hold(false);
          }}
        >
          <text fg={color(ROLES[toast().kind])} attributes={TextAttributes.BOLD}>
            {toast().title}
          </text>
          <Show when={toast().message}>
            {(message) => <text fg={color("text.muted")}>{message()}</text>}
          </Show>
        </box>
      )}
    </Show>
  );
}
