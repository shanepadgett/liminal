/**
 * The model line: `model • thinking`, the waiting pick, else the model that runs. While no provider
 * is connected, it says to run `/connect`.
 */
import { Show } from "solid-js";

import { useColor } from "@shanepadgett/liminal-tui";

import type { ModelState } from "./state.ts";

export function ModelLine(props: { readonly state: ModelState }) {
  const color = useColor();

  return (
    <Show
      when={props.state.line()}
      fallback={
        <Show when={props.state.unconnected()}>
          <text wrapMode="none">
            <span style={{ fg: color("text.muted") }}>/connect</span>
            <span style={{ fg: color("text.faint") }}> to link a provider</span>
          </text>
        </Show>
      }
    >
      {(choice) => (
        <text wrapMode="none">
          <span style={{ fg: color("text.muted") }}>
            {choice().model.slice(choice().model.indexOf("/") + 1)}
          </span>
          <Show when={choice().thinking}>
            {(thinking) => (
              <>
                <span style={{ fg: color("text.ghost") }}> • </span>
                <span style={{ fg: color("text.faint") }}>{thinking()}</span>
              </>
            )}
          </Show>
        </text>
      )}
    </Show>
  );
}
