/** Key hints: a muted key, a fainter action, ghost separators between them. */

import { For, Show } from "solid-js";

import type { RoleColor } from "./tokens/roles.ts";

const SEPARATOR = " • ";

export type Hint = readonly [key: string, action: string];

/** Nothing draws without hints, so a row of hints spaces only the ones it has. */
export function Hints(props: { readonly color: RoleColor; readonly hints: readonly Hint[] }) {
  return (
    <Show when={props.hints.length > 0}>
      <text wrapMode="none">
        <For each={props.hints}>
          {([key, action], index) => (
            <>
              <span style={{ fg: props.color("text.ghost") }}>
                {index() === 0 ? "" : SEPARATOR}
              </span>
              <span style={{ fg: props.color("text.muted") }}>{key}</span>
              <span style={{ fg: props.color("text.faint") }}>{` ${action}`}</span>
            </>
          )}
        </For>
      </text>
    </Show>
  );
}
