/**
 * A question and one line to type the answer into; enter submits it. A secret shows a dot for each
 * character: OpenTUI's input cannot hide its text, so the text is drawn in the surface color with
 * the dots drawn over it.
 */

import { createSignal, Show } from "solid-js";

import { useColor } from "./theme.ts";

export interface PromptFieldProps {
  readonly question: string;
  readonly isSecret: boolean;
  readonly onSubmit: (text: string) => void;
}

/** The prompt mark's width, where the typed text starts. */
const MARK_COLUMNS = 2;

export function PromptField(props: PromptFieldProps) {
  const color = useColor();
  const [typed, setTyped] = createSignal("");
  const surface = () => color("surface.raised");
  const textColor = () => (props.isSecret ? surface() : color("text.heading"));

  return (
    <box flexDirection="column" gap={1}>
      <text fg={color("text.base")}>{props.question}</text>
      <box flexDirection="row">
        <text flexShrink={0} fg={color("text.accent")}>
          {"› "}
        </text>
        <input
          focused
          flexGrow={1}
          onInput={setTyped}
          onSubmit={() => {
            props.onSubmit(typed());
          }}
          backgroundColor={surface()}
          focusedBackgroundColor={surface()}
          textColor={textColor()}
          focusedTextColor={textColor()}
          cursorColor={color("text.accent")}
        />
        <Show when={props.isSecret}>
          <box position="absolute" top={0} left={MARK_COLUMNS}>
            <text fg={color("text.heading")}>{"•".repeat(typed().length)}</text>
          </box>
        </Show>
      </box>
    </box>
  );
}
