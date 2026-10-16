/** A question put to the user: its options under the question's line, the chosen one marked. */

import { For } from "solid-js";

import type { RoleColor } from "../../tokens/roles.ts";
import type { AskCall } from "../entries.ts";
import { resultOf, type ToolFace } from "./face.ts";
import { Panel } from "./Panel.tsx";

/** The options, the chosen one marked. Nothing is marked while the question waits. */
function Options(props: {
  readonly color: RoleColor;
  readonly call: AskCall;
  readonly answer: string | undefined;
}) {
  return (
    <Panel color={props.color}>
      <For each={props.call.options}>
        {(option) => {
          const isChosen = () => option === props.answer;

          return (
            <text wrapMode="none" truncate>
              <span style={{ fg: props.color(isChosen() ? "text.accent" : "text.ghost") }}>
                {isChosen() ? "› " : "  "}
              </span>
              <span style={{ fg: props.color(isChosen() ? "text.accent" : "text.muted") }}>
                {option}
              </span>
            </text>
          );
        }}
      </For>
    </Panel>
  );
}

export const askFace = (call: AskCall): ToolFace => ({
  verb: "Ask",
  activeVerb: "Asking",
  subject: call.question,
  waitingBody: (color) => <Options color={color} call={call} answer={undefined} />,
  result: resultOf(call.outcome, ({ answer }) => ({
    summary: answer,
    body: (color) => <Options color={color} call={call} answer={answer} />,
  })),
});
