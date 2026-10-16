/** Key hints: a muted key, a fainter action, ghost separators between them. */

import { For } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";

export const SEPARATOR = " • ";

export type Hint = readonly [key: string, action: string];

export function Hints(props: { readonly color: RoleColor; readonly hints: readonly Hint[] }) {
  return (
    <text wrapMode="none">
      <For each={props.hints}>
        {([key, action], index) => (
          <>
            <span style={{ fg: props.color("text.ghost") }}>{index() === 0 ? "" : SEPARATOR}</span>
            <span style={{ fg: props.color("text.muted") }}>{key}</span>
            <span style={{ fg: props.color("text.faint") }}>{` ${action}`}</span>
          </>
        )}
      </For>
    </text>
  );
}
