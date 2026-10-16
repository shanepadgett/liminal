/**
 * A short notice in the top right of the chat column, under the header. A thin bar on its left edge
 * carries the kind's color; the title is bold in that color, the message muted beneath it. Every
 * kind times out, errors included.
 */

import { TextAttributes } from "@opentui/core";
import { Show } from "solid-js";

import { EDGE_BAR } from "../ornament/edgeBar.ts";
import type { RoleColor, RoleName } from "../tokens/roles.ts";

export type ToastKind = "info" | "success" | "warning" | "error";

export type ToastMessage = {
  readonly kind: ToastKind;
  readonly title: string;
  readonly message?: string;
};

const KIND_ROLES: Readonly<Record<ToastKind, RoleName>> = {
  info: "feedback.info",
  success: "feedback.success",
  warning: "feedback.warning",
  error: "feedback.danger",
};

const TOAST_COLUMNS = 48;

export function Toast(props: { readonly color: RoleColor; readonly toast: ToastMessage }) {
  const accent = () => props.color(KIND_ROLES[props.toast.kind]);

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
