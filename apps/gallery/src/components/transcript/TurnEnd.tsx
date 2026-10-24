/**
 * The line that closes a turn: how the turn ended in a bold word, then the model that answered and
 * how long the turn ran in faint text, centered between two short lines. Each line covers half the
 * space on its side, so the divider reads as a break without running edge to edge. A finished
 * turn's word is the accent; a stop is red; an interrupted turn is the warning yellow and has no
 * time.
 */

import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";

export type Ending = "finished" | "stopped" | "interrupted";

const LOOK: Readonly<Record<Ending, { readonly word: string; readonly role: RoleName }>> = {
  finished: { word: "Done", role: "text.accent" },
  stopped: { word: "Stopped", role: "feedback.danger" },
  interrupted: { word: "Interrupted", role: "feedback.warning" },
};

/** One stretch of the divider: a box whose only border is its top edge. */
function Line() {
  const color = useColor();

  return <box flexGrow={1} height={1} border={["top"]} borderColor={color("border.subtle")} />;
}

/** Empty space beside a line, as wide as it, so each line covers half its side. */
function Gap() {
  return <box flexGrow={1} height={1} />;
}

export function TurnEnd(props: {
  readonly ending: Ending;
  readonly model: string;
  /** How long the turn ran, such as `14s` or `2m 05s`; left out for an interrupted turn. */
  readonly time?: string;
}) {
  const color = useColor();
  const look = () => LOOK[props.ending];

  return (
    <box flexDirection="row" flexShrink={0}>
      <Gap />
      <Line />
      {/* A text at a half column is drawn a column left of where the lines end; a box rounds like them. */}
      <box flexShrink={0}>
        <text wrapMode="none">
          <span style={{ fg: color(look().role), bold: true }}>{` ${look().word}`}</span>
          <span style={{ fg: color("text.faint") }}>
            {`${[props.model, props.time ?? []]
              .flat()
              .map((detail) => ` · ${detail}`)
              .join("")} `}
          </span>
        </text>
      </box>
      <Line />
      <Gap />
    </box>
  );
}
