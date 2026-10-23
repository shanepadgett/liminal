/**
 * The line that closes a turn: a square, how the turn ended, then the model that answered and how
 * long the turn ran, in faint text. A finished turn's square is the accent; a stop is red and bold;
 * an interrupted turn is quiet and has no time.
 */

import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";

export type Ending = "finished" | "stopped" | "interrupted";

const SQUARE = "■";

const LOOK: Readonly<
  Record<
    Ending,
    {
      readonly word: string;
      readonly squareRole: RoleName;
      readonly wordRole: RoleName;
      readonly isBold: boolean;
    }
  >
> = {
  finished: { word: "Done", squareRole: "text.accent", wordRole: "text.muted", isBold: false },
  stopped: {
    word: "Stopped",
    squareRole: "feedback.danger",
    wordRole: "feedback.danger",
    isBold: true,
  },
  interrupted: {
    word: "Interrupted",
    squareRole: "text.faint",
    wordRole: "text.muted",
    isBold: false,
  },
};

export function TurnEnd(props: {
  readonly ending: Ending;
  readonly model: string;
  /** How long the turn ran, such as `14s` or `2m 05s`; left out for an interrupted turn. */
  readonly time?: string;
}) {
  const color = useColor();
  const look = () => LOOK[props.ending];

  return (
    <text flexShrink={0}>
      <span style={{ fg: color(look().squareRole) }}>{`${SQUARE} `}</span>
      <span style={{ fg: color(look().wordRole), bold: look().isBold }}>{look().word}</span>
      <span style={{ fg: color("text.faint") }}>
        {[props.model, props.time ?? []]
          .flat()
          .map((detail) => ` · ${detail}`)
          .join("")}
      </span>
    </text>
  );
}
