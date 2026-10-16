/**
 * A one-row line along the top of a surface that moves while the agent works. Idle, it is a blank
 * row of the surface, so starting and stopping never moves the layout.
 */

import { Track } from "../ornament/Track.tsx";
import type { RoleColor } from "../tokens/roles.ts";
import { ditherCells, type ScanMotion, scanLevels } from "./scan.ts";

export function ScanLine(props: {
  readonly color: RoleColor;
  readonly surface: string;
  readonly isWorking: boolean;
  readonly motion: ScanMotion;
}) {
  const levels = () => scanLevels(props.color, props.surface);

  return (
    <Track
      isPlaying={props.isWorking}
      periodMs={props.motion.periodMs}
      draw={(columns, phase) =>
        ditherCells(
          props.isWorking ? props.motion.light(columns, phase) : Array(columns).fill(0),
          levels(),
        )
      }
    />
  );
}
