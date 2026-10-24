/**
 * A turn's last line: how the turn ended in a bold word, then the model and how long it ran in
 * faint text, centered between two short lines. Each line covers half the space on its side, so the
 * divider reads as a break without running edge to edge. A finished turn's word is the accent, a
 * stop is red and an interrupted turn is the warning yellow.
 */

import { Duration } from "effect";

import type { RoleName } from "@shanepadgett/liminal-client";
import { useColor } from "@shanepadgett/liminal-tui";

import type { Ending } from "../view/index.ts";

const LOOK: Readonly<Record<Ending, { readonly word: string; readonly role: RoleName }>> = {
  done: { word: "Done", role: "text.accent" },
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
    <box flexDirection="row" flexShrink={0}>
      <Gap />
      <Line />
      {/* A text at a half column is drawn a column left of where the lines end; a box rounds like them. */}
      <box flexShrink={0}>
        <text wrapMode="none">
          <span style={{ fg: color(look().role), bold: true }}>{` ${look().word}`}</span>
          <span style={{ fg: color("text.faint") }}>{`${details()} `}</span>
        </text>
      </box>
      <Line />
      <Gap />
    </box>
  );
}
