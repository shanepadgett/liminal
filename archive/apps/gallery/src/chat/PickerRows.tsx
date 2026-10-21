/** Rows shared by the picker dialogs: the filter line and a row of a name then its detail. */

import { Show } from "solid-js";

import type { RoleColor } from "@liminal/sdk/tui";

import { ListRow } from "./ListRow.tsx";

/** A picker row: the name, then a fainter detail such as a model id or a time. */
export function NamedRow(props: {
  readonly color: RoleColor;
  readonly name: string;
  readonly detail: string;
  /** A word at the right edge, such as `default`. */
  readonly tag?: string | undefined;
  readonly isSelected: boolean;
}) {
  return (
    <ListRow color={props.color} isSelected={props.isSelected}>
      <box flexDirection="row" gap={2} flexGrow={1}>
        <text
          flexShrink={0}
          wrapMode="none"
          fg={props.color(props.isSelected ? "text.base" : "text.muted")}
        >
          {props.name}
        </text>
        <text
          flexGrow={1}
          wrapMode="none"
          fg={props.color(props.isSelected ? "text.muted" : "text.faint")}
        >
          {props.detail}
        </text>
        <Show when={props.tag}>
          {(tag) => (
            <text
              flexShrink={0}
              wrapMode="none"
              fg={props.color(props.isSelected ? "text.muted" : "text.faint")}
            >
              {tag()}
            </text>
          )}
        </Show>
      </box>
    </ListRow>
  );
}

/** The empty filter line at the top of a picker. */
export function FilterLine(props: { readonly color: RoleColor }) {
  return (
    <text flexShrink={0}>
      <span style={{ fg: props.color("text.accent") }}>{"› "}</span>
      <span style={{ fg: props.color("text.ghost") }}>Type to filter</span>
    </text>
  );
}
