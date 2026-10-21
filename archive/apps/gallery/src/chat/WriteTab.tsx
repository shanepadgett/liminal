/**
 * A tab the user answers in their own words: a question that wants a written answer, with the
 * answer the assistant suggests, or the closing tab for anything else the assistant should know.
 */

import { Show } from "solid-js";

import type { Recommendation } from "@liminal/questions/contract";
import type { RoleColor } from "@liminal/sdk/tui";

import { Suggested } from "./Suggested.tsx";

const FIELD_ROWS = 2;

export function WriteTab(props: {
  readonly color: RoleColor;
  readonly prompt: string;
  /** Said after the prompt, more quietly, such as that the tab is optional. */
  readonly aside: string;
  readonly recommendation: Recommendation | undefined;
  readonly text: string;
  readonly placeholder: string;
}) {
  const surface = () => props.color("surface.raised");

  return (
    <box flexDirection="column">
      <text>
        <span style={{ fg: props.color("text.base") }}>{props.prompt}</span>
        <span style={{ fg: props.color("text.faint") }}>
          {props.aside === "" ? "" : `  ${props.aside}`}
        </span>
      </text>
      <Show when={props.recommendation}>
        {(recommendation) => (
          <box marginTop={1}>
            <Suggested color={props.color} recommendation={recommendation()} />
          </box>
        )}
      </Show>
      <box flexDirection="row" marginTop={1}>
        <text wrapMode="none" flexShrink={0} fg={props.color("text.accent")}>
          {"› "}
        </text>
        <textarea
          flexGrow={1}
          height={FIELD_ROWS}
          initialValue={props.text}
          placeholder={props.placeholder}
          backgroundColor={surface()}
          focusedBackgroundColor={surface()}
          textColor={props.color("text.heading")}
          focusedTextColor={props.color("text.heading")}
          placeholderColor={props.color("text.faint")}
          cursorColor={props.color("text.accent")}
        />
      </box>
    </box>
  );
}
