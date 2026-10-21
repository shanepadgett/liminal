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
  { name: "text.ghost", ramp: "neutral", step: 600 },
  { name: "text.accent", ramp: "accent", step: 300 },
  /** Section titles, set in bold. */
  { name: "text.heading", ramp: "accent", step: 200 },
  /** Text on a solid fill, such as a chip label. */
  { name: "text.inverse", ramp: "neutral", step: 950 },
  { name: "fill.accent", ramp: "accent", step: 400 },
  { name: "fill.danger", ramp: "danger", step: 400 },
  { name: "fill.warning", ramp: "warning", step: 400 },
  { name: "fill.success", ramp: "success", step: 400 },
  { name: "fill.info", ramp: "info", step: 400 },
  { name: "feedback.danger", ramp: "danger", step: 300 },
  { name: "feedback.warning", ramp: "warning", step: 300 },
  { name: "feedback.success", ramp: "success", step: 300 },
  { name: "feedback.info", ramp: "info", step: 300 },
  /** Pending and secondary states that still need their hue, such as a running tool's icon. */
  { name: "feedback.danger.subtle", ramp: "danger", step: 600 },
  { name: "feedback.warning.subtle", ramp: "warning", step: 600 },
  { name: "feedback.success.subtle", ramp: "success", step: 600 },
  { name: "feedback.info.subtle", ramp: "info", step: 600 },
  /** Ends of the gradient used by the signature ornament and loading animation. */
  { name: "gradient.from", ramp: "accent", step: 200 },
  { name: "gradient.to", ramp: "accent", step: 600 },
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
