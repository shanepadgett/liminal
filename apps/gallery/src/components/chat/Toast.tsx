/** A short message in the corner that goes away on its own, led by a loud little badge. */

import { Show } from "solid-js";

import { Chip, type Tone } from "../../primitives/Chip.tsx";
import { useColor } from "../../theme/theme.tsx";

export type ToastKind = "info" | "success" | "warning" | "error";

const BADGE: Readonly<Record<ToastKind, { readonly label: string; readonly tone: Tone }>> = {
  info: { label: "NOTE", tone: "info" },
  success: { label: "NICE", tone: "success" },
  warning: { label: "HEADS UP", tone: "warning" },
  error: { label: "OOPS", tone: "danger" },
};

const TOAST_COLUMNS = 44;

export function Toast(props: {
  readonly kind: ToastKind;
  readonly title: string;
  readonly message?: string;
}) {
  const color = useColor();

  return (
    <box width={TOAST_COLUMNS} backgroundColor={color("surface.overlay")} padding={1}>
      <box flexDirection="row" gap={1}>
        <Chip label={BADGE[props.kind].label} tone={BADGE[props.kind].tone} />
        <text fg={color("text.base")}>{props.title}</text>
      </box>
      <Show when={props.message}>
        {(message) => (
          <text marginTop={1} fg={color("text.muted")}>
            {message()}
          </text>
        )}
      </Show>
    </box>
  );
}
