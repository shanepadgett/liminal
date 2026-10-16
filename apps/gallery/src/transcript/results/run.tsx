/** A shell command: its last lines of output. */

import { For, Show } from "solid-js";

import type { RoleColor } from "../../tokens/roles.ts";
import type { RunCall } from "../entries.ts";
import { resultOf, type ToolFace } from "./face.ts";
import { MoreLines, Panel } from "./Panel.tsx";

export function Output(props: { readonly color: RoleColor; readonly lines: readonly string[] }) {
  return (
    <For each={props.lines}>
      {(line) => (
        <text wrapMode="none" truncate fg={props.color("text.muted")}>
          {line}
        </text>
      )}
    </For>
  );
}

export const runFace = (call: RunCall): ToolFace => ({
  verb: "Run",
  activeVerb: "Running",
  subject: call.command,
  result: resultOf(call.outcome, ({ output, hiddenLines }) => ({
    summary: `${output.length + hiddenLines} lines`,
    body: (color) => (
      <Panel color={color}>
        <Show when={hiddenLines > 0}>
          <MoreLines color={color} count={hiddenLines} />
        </Show>
        <Output color={color} lines={output} />
      </Panel>
    ),
  })),
});
