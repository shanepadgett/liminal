/** Rows shared by the picker dialogs: the filter line and a row of a name then its detail. */

import { Show } from "solid-js";

import { EllipsizedText, type RoleColor } from "@liminal/sdk/tui";

import { ListRow } from "./ListRow.tsx";

/** A picker row: the name, then a fainter detail such as a model id or a time. */
export function NamedRow(props: {
  readonly color: RoleColor;
  readonly name: string;
  readonly detail: string;
  readonly detailPosition?: "after-name" | "right";
  /** A word at the right edge, such as `default`. */
  readonly tag?: string | undefined;
  readonly isSelected: boolean;
}) {
  const isTrailing = () => props.detailPosition === "right";

  return (
    <ListRow color={props.color} isSelected={props.isSelected}>
      <box flexDirection="row" gap={2} flexGrow={1}>
        <Show
          when={isTrailing()}
          fallback={
            <text
              flexShrink={0}
              wrapMode="none"
              fg={props.color(props.isSelected ? "text.base" : "text.muted")}
            >
              {props.name}
            </text>
          }
        >
          <EllipsizedText
            text={props.name}
            fg={props.color(props.isSelected ? "text.base" : "text.muted")}
          />
        </Show>
        <text
          flexGrow={isTrailing() ? 0 : 1}
          flexShrink={isTrailing() ? 0 : 1}
          maxWidth={isTrailing() ? "50%" : "100%"}
          wrapMode="none"
          truncate
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
