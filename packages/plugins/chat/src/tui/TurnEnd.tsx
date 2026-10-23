/**
 * A turn's last line: a square, how the turn ended, then the model and how long it ran in faint
 * text. A finished turn's square is the accent; a stop is red and bold; an interrupted turn is
 * quiet.
 */

import { Duration } from "effect";

import type { RoleName } from "@shanepadgett/liminal-client";
import { useColor } from "@shanepadgett/liminal-tui";

import type { Ending } from "../view/index.ts";

const SQUARE = "■";

interface Look {
  readonly word: string;
  readonly square: RoleName;
  readonly text: RoleName;
  readonly isBold: boolean;
}

const LOOK: Readonly<Record<Ending, Look>> = {
  done: { word: "Done", square: "text.accent", text: "text.muted", isBold: false },
  stopped: { word: "Stopped", square: "feedback.danger", text: "feedback.danger", isBold: true },
  interrupted: { word: "Interrupted", square: "text.faint", text: "text.muted", isBold: false },
};

const twoDigits = (value: number) => String(value).padStart(2, "0");

/** `14s`, `2m 05s` or `1h 02m`. */
const elapsedOf = (ran: Duration.Duration) => {
  const seconds = Math.round(Duration.toSeconds(ran));
  const minutes = Math.floor(seconds / 60);

  if (minutes === 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${twoDigits(seconds % 60)}s`;

  return `${Math.floor(minutes / 60)}h ${twoDigits(minutes % 60)}m`;
};

/** The model without its provider, as the composer's model line shows it. */
const modelNameOf = (model: string) => model.slice(model.indexOf("/") + 1);

export function TurnEnd(props: {
  readonly ending: Ending;
  readonly model: string | undefined;
  readonly ran: Duration.Duration | undefined;
}) {
  const color = useColor();
  const look = () => LOOK[props.ending];

  const details = () =>
    [
      ...(props.model === undefined ? [] : [modelNameOf(props.model)]),
      ...(props.ran === undefined ? [] : [elapsedOf(props.ran)]),
    ]
      .map((detail) => ` · ${detail}`)
      .join("");

  return (
    <text flexShrink={0}>
      <span style={{ fg: color(look().square) }}>{`${SQUARE} `}</span>
      <span style={{ fg: color(look().text), bold: look().isBold }}>{look().word}</span>
      <span style={{ fg: color("text.faint") }}>{details()}</span>
    </text>
  );
}
