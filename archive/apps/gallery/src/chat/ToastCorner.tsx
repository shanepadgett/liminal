/** Where a toast sits in the chat column: top right, one row under the header. */

import { Show } from "solid-js";

import { HEADER_ROWS, type RoleColor } from "@liminal/sdk/tui";

import { Toast, type ToastMessage } from "./Toast.tsx";

export function ToastCorner(props: {
  readonly color: RoleColor;
  readonly toast: ToastMessage | undefined;
}) {
  return (
    <Show when={props.toast}>
      {(toast) => (
        <box position="absolute" top={HEADER_ROWS + 1} right={2} zIndex={5}>
          <Toast color={props.color} toast={toast()} />
        </box>
      )}
    </Show>
  );
}
