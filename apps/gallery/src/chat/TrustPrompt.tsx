/**
 * The trust prompt, in the composer's place in an untrusted workspace: the composer's raised
 * surface asking whether to trust the folder, with what trusting it loads, and the key hints under
 * it. A failed save shows under the question in the danger color.
 */

import { Show } from "solid-js";

import { type Hint, Hints, type RoleColor } from "@liminal/sdk/tui";

const HINTS: readonly Hint[] = [
  ["enter", "trust"],
  ["esc", "not now"],
];

const EXPLAIN =
  "Trusting it loads the settings and plugins in its .liminal folder, and plugins can run code. Its subfolders are trusted too.";

export function TrustPrompt(props: {
  readonly color: RoleColor;
  readonly workspace: string;
  /** Why the last trust failed to save; empty when it did not fail. */
  readonly problem: string;
}) {
  return (
    <box flexDirection="column" flexShrink={0}>
      <box
        flexDirection="column"
        backgroundColor={props.color("surface.raised")}
        paddingX={2}
        paddingY={1}
      >
        <text fg={props.color("text.base")}>Trust this folder?</text>
        <text fg={props.color("text.accent")}>{props.workspace}</text>
        <text fg={props.color("text.muted")} marginTop={1}>
          {EXPLAIN}
        </text>
        <Show when={props.problem !== ""}>
          <text fg={props.color("feedback.danger")} marginTop={1}>
            {props.problem}
          </text>
        </Show>
      </box>
      <box paddingX={2}>
        <Hints color={props.color} hints={HINTS} />
      </box>
    </box>
  );
}
