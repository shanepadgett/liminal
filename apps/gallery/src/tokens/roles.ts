/**
 * Semantic roles: what a color is for. Components use roles, never ramp steps, so a palette swap
 * changes every component at once.
 */

import type { Palette, RampName } from "./palettes.ts";
import { buildRamp, type Step } from "./ramp.ts";

type RoleSpec = { readonly name: string; readonly ramp: RampName; readonly step: Step };

export const ROLES = [
  { name: "surface.base", ramp: "neutral", step: 950 },
  { name: "surface.raised", ramp: "neutral", step: 900 },
  { name: "surface.overlay", ramp: "neutral", step: 850 },
  { name: "surface.selected", ramp: "neutral", step: 800 },
  { name: "border.subtle", ramp: "neutral", step: 800 },
  { name: "border.base", ramp: "neutral", step: 700 },
  { name: "border.focus", ramp: "accent", step: 400 },
  { name: "text.base", ramp: "neutral", step: 100 },
  { name: "text.muted", ramp: "neutral", step: 300 },
  { name: "text.faint", ramp: "neutral", step: 500 },
  { name: "text.accent", ramp: "accent", step: 300 },
  { name: "feedback.danger", ramp: "danger", step: 300 },
  { name: "feedback.warning", ramp: "warning", step: 300 },
  { name: "feedback.success", ramp: "success", step: 300 },
  { name: "feedback.info", ramp: "info", step: 300 },
] as const satisfies readonly RoleSpec[];

export type RoleName = (typeof ROLES)[number]["name"];

export type RoleColor = (name: RoleName) => string;

/** Bright magenta marks a role whose step is missing from its ramp, so the gap is obvious. */
const MISSING_STEP = "#ff00ff";

export const resolveRoles = (palette: Palette): RoleColor => {
  const hexes = new Map<string, string>(
    ROLES.flatMap((role) => {
      const swatch = buildRamp(palette.ramps[role.ramp]).find((each) => each.step === role.step);

      return swatch === undefined ? [] : [[role.name, swatch.hex] as const];
    }),
  );

  return (name) => hexes.get(name) ?? MISSING_STEP;
};
