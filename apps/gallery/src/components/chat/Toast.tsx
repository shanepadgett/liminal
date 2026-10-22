/** A short message in the corner that goes away on its own. */

import { Show } from "solid-js";

import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";

export type ToastKind = "info" | "success" | "warning" | "error";

const TONE: Readonly<Record<ToastKind, RoleName>> = {
  info: "feedback.info",
  success: "feedback.success",
  warning: "feedback.warning",
  error: "feedback.danger",
};

const TOAST_COLUMNS = 40;

export function Toast(props: {
  readonly kind: ToastKind;
  readonly title: string;
  readonly message?: string;
}) {
  const color = useColor();

  return (
    <box
      width={TOAST_COLUMNS}
      border={["left"]}
      borderColor={color(TONE[props.kind])}
      backgroundColor={color("surface.overlay")}
      paddingX={1}
    >
      <text fg={color("text.base")}>{props.title}</text>
      <Show when={props.message}>
        {(message) => <text fg={color("text.muted")}>{message()}</text>}
      </Show>
    </box>
  );
}
