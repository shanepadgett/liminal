/** The repository checks: each check with whether it passed and what it found. */

import { For } from "solid-js";

import type { ChecksCall } from "../entries.ts";
import { STATUS } from "../status.ts";
import { resultOf, type ToolFace } from "./face.ts";
import { Panel } from "./Panel.tsx";

/** Wide enough for the longest check name, so the summaries line up. */
const NAME_COLUMNS = 8;

export const checksFace = (call: ChecksCall): ToolFace => ({
  verb: "Checks",
  activeVerb: "Checking",
  subject: "",
  result: resultOf(call.outcome, ({ checks }) => ({
    summary: `${checks.filter((check) => check.hasPassed).length} of ${checks.length} passed`,
    body: (color) => (
      <Panel color={color}>
        <For each={checks}>
          {(check) => {
            const status = STATUS[check.hasPassed ? "done" : "failed"];

            return (
              <text wrapMode="none" truncate>
                <span style={{ fg: color(status.role) }}>{`${status.glyph} `}</span>
                <span style={{ fg: color("text.muted") }}>{check.name.padEnd(NAME_COLUMNS)}</span>
                <span style={{ fg: color("text.faint") }}>{check.summary}</span>
              </text>
            );
          }}
        </For>
      </Panel>
    ),
  })),
});
