/**
 * A one-row line along the top of a surface that glides with the header while the agent works.
 * Idle, it is a blank row of the surface, so starting and stopping never moves the layout.
 */

import { GLIDE_PERIOD_MS, type RoleColor, Track } from "@liminal/sdk/tui";

import { ditherCells, glideLight, scanLevels } from "./scan.ts";

export function ScanLine(props: {
  readonly color: RoleColor;
  readonly surface: string;
  readonly isWorking: boolean;
}) {
  const levels = () => scanLevels(props.color, props.surface);

  return (
    <Track
      isPlaying={props.isWorking}
      periodMs={GLIDE_PERIOD_MS}
      draw={(columns, phase) =>
        ditherCells(props.isWorking ? glideLight(columns, phase) : Array(columns).fill(0), levels())
      }
    />
  );
}
