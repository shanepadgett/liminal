/** A file read: the opening lines of the file, numbered. */

import { For, Show } from "solid-js";

import type { ReadCall } from "../entries.ts";
import { resultOf, type ToolFace } from "./face.ts";
import { gutter, MoreLines, Panel } from "./Panel.tsx";

export const readFace = (call: ReadCall): ToolFace => ({
  verb: "Read",
  activeVerb: "Reading",
  subject: call.path,
  result: resultOf(call.outcome, ({ excerpt, totalLines }) => {
    const numberOf = gutter([excerpt.length]);

    return {
      summary: `${totalLines} lines`,
      body: (color) => (
        <Panel color={color}>
          <For each={excerpt}>
            {(line, index) => (
              <text wrapMode="none" truncate>
                <span style={{ fg: color("text.ghost") }}>{`${numberOf(index() + 1)}  `}</span>
                <span style={{ fg: color("text.muted") }}>{line}</span>
              </text>
            )}
          </For>
          <Show when={totalLines > excerpt.length}>
            <MoreLines color={color} count={totalLines - excerpt.length} />
          </Show>
        </Panel>
      ),
    };
  }),
});
