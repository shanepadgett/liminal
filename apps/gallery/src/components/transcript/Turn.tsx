/**
 * One turn: what the user sent, on its own raised band, then everything the reply did, indented. An
 * input scrolled past the top of the transcript sticks there instead.
 */

import type { JSX } from "@opentui/solid";
import { Show } from "solid-js";

import { Prompt } from "./Prompt.tsx";

export function Turn(props: {
  /** Left out when the input has scrolled past and sticks to the top of the transcript. */
  readonly input?: string;
  readonly children: JSX.Element;
}) {
  return (
    <box flexShrink={0} gap={1} marginBottom={1}>
      <Show when={props.input}>{(input) => <Prompt input={input()} />}</Show>
      <box gap={1} paddingLeft={3}>
        {props.children}
      </box>
    </box>
  );
}
