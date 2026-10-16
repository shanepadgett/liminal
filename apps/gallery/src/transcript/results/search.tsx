/** A text search: each match's place and line, with the pattern marked in the accent color. */

import { For } from "solid-js";

import type { RoleColor } from "../../tokens/roles.ts";
import type { SearchCall, SearchMatch } from "../entries.ts";
import { resultOf, type ToolFace } from "./face.ts";
import { Panel } from "./Panel.tsx";

function MatchLine(props: {
  readonly color: RoleColor;
  readonly match: SearchMatch;
  readonly pattern: string;
}) {
  const at = () => props.match.text.indexOf(props.pattern);
  const end = () => at() + props.pattern.length;

  return (
    <text wrapMode="none" truncate>
      <span style={{ fg: props.color("text.faint") }}>
        {`${props.match.path}:${props.match.line}  `}
      </span>
      <span style={{ fg: props.color("text.muted") }}>{props.match.text.slice(0, at())}</span>
      <span style={{ fg: props.color("text.accent") }}>{props.pattern}</span>
      <span style={{ fg: props.color("text.muted") }}>{props.match.text.slice(end())}</span>
    </text>
  );
}

export const searchFace = (call: SearchCall): ToolFace => ({
  verb: "Search",
  activeVerb: "Searching",
  subject: `${call.pattern} in ${call.scope}`,
  result: resultOf(call.outcome, ({ matches }) => ({
    summary: `${matches.length} matches`,
    body: (color) => (
      <Panel color={color}>
        <For each={matches}>
          {(match) => <MatchLine color={color} match={match} pattern={call.pattern} />}
        </For>
      </Panel>
    ),
  })),
});
