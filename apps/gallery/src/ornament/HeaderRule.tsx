/**
 * The header line: hairlines that fill the width they are given and thicken into the fade at the
 * right end. While `isWorking`, the fade glides along them and back. Used by every header, so the
 * chat window and its dialogs share one title style.
 */

import type { RoleColor, RoleName } from "../tokens/roles.ts";
import { GLIDE_PERIOD_MS, glideRun, restingRun, runCells } from "./glide.ts";
import { Track } from "./Track.tsx";

export function HeaderRule(props: {
  readonly color: RoleColor;
  /** The surface the line sits on, so the fade's cut cells match it. */
  readonly surface: RoleName;
  readonly isWorking: boolean;
}) {
  return (
    <box flexGrow={1}>
      <Track
        isPlaying={props.isWorking}
        periodMs={GLIDE_PERIOD_MS}
        draw={(columns, phase) =>
          runCells(
            props.color,
            props.surface,
            columns,
            props.isWorking ? glideRun(phase, columns) : restingRun(columns),
          )
        }
      />
    </box>
  );
}
