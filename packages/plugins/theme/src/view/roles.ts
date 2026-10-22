/** Each role's ramp and step: what makes a palette's ramps into role colors. */
import type { RoleName } from "@shanepadgett/liminal-client";

import type { Palette, RampName, Step } from "../contract.ts";
import { buildRamp } from "./ramp.ts";

interface RoleSpec {
  readonly ramp: RampName;
  readonly step: Step;
}

const ROLES: Readonly<Record<RoleName, RoleSpec>> = {
  "surface.base": { ramp: "neutral", step: 950 },
  "surface.raised": { ramp: "neutral", step: 900 },
  "surface.overlay": { ramp: "neutral", step: 850 },
  "surface.selected": { ramp: "neutral", step: 800 },
  "border.subtle": { ramp: "neutral", step: 800 },
  "border.base": { ramp: "neutral", step: 700 },
  "border.focus": { ramp: "accent", step: 400 },
  "text.base": { ramp: "neutral", step: 100 },
  "text.muted": { ramp: "neutral", step: 300 },
  "text.faint": { ramp: "neutral", step: 500 },
  "text.ghost": { ramp: "neutral", step: 600 },
  "text.accent": { ramp: "accent", step: 300 },
  "text.heading": { ramp: "accent", step: 200 },
  "text.inverse": { ramp: "neutral", step: 950 },
  "fill.accent": { ramp: "accent", step: 400 },
  "fill.danger": { ramp: "danger", step: 400 },
  "fill.warning": { ramp: "warning", step: 400 },
  "fill.success": { ramp: "success", step: 400 },
  "fill.info": { ramp: "info", step: 400 },
  "feedback.danger": { ramp: "danger", step: 300 },
  "feedback.warning": { ramp: "warning", step: 300 },
  "feedback.success": { ramp: "success", step: 300 },
  "feedback.info": { ramp: "info", step: 300 },
  "feedback.danger.subtle": { ramp: "danger", step: 600 },
  "feedback.warning.subtle": { ramp: "warning", step: 600 },
  "feedback.success.subtle": { ramp: "success", step: 600 },
  "feedback.info.subtle": { ramp: "info", step: 600 },
  "gradient.from": { ramp: "accent", step: 200 },
  "gradient.to": { ramp: "accent", step: 600 },
  ornament: { ramp: "accent", step: 600 },
  "ornament.subtle": { ramp: "accent", step: 800 },
};

/** Bright magenta marks a role whose step is missing from its ramp, so the gap is obvious. */
const MISSING_STEP = "#ff00ff";

/** The hex color of each role in `palette`, worked out on first use. */
export const roleColors = (palette: Palette): ((role: RoleName) => string) => {
  const hexes = new Map<RoleName, string>();

  const hexOf = ({ ramp, step }: RoleSpec) =>
    buildRamp(palette.ramps[ramp]).find((each) => each.step === step)?.hex ?? MISSING_STEP;

  return (role) => {
    const known = hexes.get(role);
    if (known !== undefined) return known;
    const hex = hexOf(ROLES[role]);
    hexes.set(role, hex);

    return hex;
  };
};
