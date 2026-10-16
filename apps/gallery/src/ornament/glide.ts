/**
 * The fade set gliding. The run of eighth blocks always leads with its thick end and trails its
 * thin end behind. It eases from the right end of the hairline to the left and back without ever
 * stopping, and at each turn the trail draws into the thick end before streaming out the other way.
 * When idle the row shows the resting run, the still header.
 */

import { mixHex } from "../tokens/oklch.ts";
import type { RoleColor, RoleName } from "../tokens/roles.ts";
import { type Cell, FADE, HAIRLINE } from "./fade.ts";

/** One glide there and back. */
export const GLIDE_PERIOD_MS = 3200;

/** Where the leftward glide ends and the rightward one begins, as a share of the loop. */
const TURN = 0.5;

/** How long the trail streams at full speed, as a share of the row. */
const TRAIL_SHARE = 0.3;

/** The run gathered into its thick end. */
const GATHERED_LENGTH = 1;

const REST_LENGTH = FADE.length;

/**
 * The run in columns. `head` is the edge it leads with: a rightward run covers the columns just
 * left of it, a leftward run the columns just right of it.
 */
export type Run = {
  readonly heading: "right" | "left";
  readonly head: number;
  readonly length: number;
};

const easeInOutSine = (progress: number) => (1 - Math.cos(Math.PI * progress)) / 2;

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

/** The run at rest against the right end of the hairline: the still header. */
export const restingRun = (columns: number): Run => ({
  heading: "right",
  head: columns,
  length: REST_LENGTH,
});

/**
 * The run at `phase`, from 0 to 1 over one `GLIDE_PERIOD_MS`. It is always moving: the first half
 * eases from the right end to the left, the second half eases back.
 */
export const glideRun = (phase: number, columns: number): Run => {
  const isLeftward = phase < TURN;
  const progress = isLeftward ? phase / TURN : (phase - TURN) / (1 - TURN);
  const length = GATHERED_LENGTH + TRAIL_SHARE * columns * Math.sin(Math.PI * progress);

  if (isLeftward) {
    return {
      heading: "left",
      head: lerp(columns - GATHERED_LENGTH, 0, easeInOutSine(progress)),
      length,
    };
  }

  return {
    heading: "right",
    head: lerp(GATHERED_LENGTH, columns, easeInOutSine(progress)),
    length,
  };
};

/**
 * How far `column` sits along the run, from 0 at its thin trailing end to 1 at its thick head, or
 * undefined when the run does not cover it.
 */
export const alongRun = (run: Run, column: number): number | undefined => {
  const fromHead = run.heading === "right" ? run.head - 1 - column : column - run.head;
  if (fromHead < 0 || fromHead >= run.length) return undefined;

  return 1 - fromHead / run.length;
};

/**
 * The block `step` eighths thick, against the side of the cell the head faces. Eighth blocks only
 * grow from the left, so a leftward block paints the surface over a filled cell instead.
 */
const blockCell = (step: number, heading: Run["heading"], fg: string, bg: string): Cell => {
  if (heading === "right") return { glyph: FADE[step] ?? HAIRLINE, fg, bg };
  if (step === FADE.length - 1) return { glyph: FADE[step] ?? HAIRLINE, fg, bg };

  return { glyph: FADE[FADE.length - 2 - step] ?? HAIRLINE, fg: bg, bg: fg };
};

/** The header's hairline row with `run` on it. */
export const runCells = (
  color: RoleColor,
  surfaceRole: RoleName,
  columns: number,
  run: Run,
): readonly Cell[] => {
  const top = FADE.length - 1;
  const surface = color(surfaceRole);

  return Array.from({ length: columns }, (_, column) => {
    const along = alongRun(run, column);
    if (along === undefined) return { glyph: HAIRLINE, fg: color("border.subtle"), bg: surface };

    const step = Math.min(top, Math.floor(along * FADE.length - 1e-9));
    const fg = mixHex(color("gradient.to"), color("gradient.from"), step / top);

    return blockCell(Math.max(0, step), run.heading, fg, surface);
  });
};
