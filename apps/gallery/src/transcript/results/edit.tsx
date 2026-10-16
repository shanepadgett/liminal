/** A file edit: the changed lines as a diff, removed lines tinted red and added lines green. */

import { For } from "solid-js";

import type { RoleName } from "../../tokens/roles.ts";
import type { DiffLine, EditCall } from "../entries.ts";
import { resultOf, type ToolFace } from "./face.ts";
import { gutter, Panel } from "./Panel.tsx";

const CHANGE: Readonly<
  Record<
    DiffLine["change"],
    { readonly sign: string; readonly signRole: RoleName; readonly tint: RoleName }
  >
> = {
  added: { sign: "+", signRole: "feedback.success", tint: "feedback.success.subtle" },
  removed: { sign: "-", signRole: "feedback.danger", tint: "feedback.danger.subtle" },
  kept: { sign: " ", signRole: "text.ghost", tint: "surface.raised" },
};

const countOf = (diff: readonly DiffLine[], change: DiffLine["change"]) =>
  diff.filter((line) => line.change === change).length;

export const editFace = (call: EditCall): ToolFace => ({
  verb: "Edit",
  activeVerb: "Editing",
  subject: call.path,
  result: resultOf(call.outcome, ({ diff }) => {
    const numberOf = gutter(diff.map((line) => line.number));

    return {
      summary: `+${countOf(diff, "added")} -${countOf(diff, "removed")}`,
      body: (color) => (
        <Panel color={color}>
          <For each={diff}>
            {(line) => {
              const change = CHANGE[line.change];

              return (
                <text wrapMode="none" truncate bg={color(change.tint)}>
                  <span style={{ fg: color("text.ghost") }}>{`${numberOf(line.number)} `}</span>
                  <span style={{ fg: color(change.signRole) }}>{`${change.sign} `}</span>
                  <span style={{ fg: color("text.base") }}>{line.text}</span>
                </text>
              );
            }}
          </For>
        </Panel>
      ),
    };
  }),
});
