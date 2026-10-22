/**
 * Liminal's colors as every frontend names them. Components use role names, never ramp steps, so a
 * palette swap changes every component at once.
 */

/** What a color is for. */
export type RoleName =
  | "surface.base"
  | "surface.raised"
  | "surface.overlay"
  | "surface.selected"
  | "border.subtle"
  | "border.base"
  | "border.focus"
  | "text.base"
  | "text.muted"
  | "text.faint"
  | "text.ghost"
  | "text.accent"
  /** Section titles, set in bold. */
  | "text.heading"
  /** Text on a solid fill, such as a chip label. */
  | "text.inverse"
  | "fill.accent"
  | "fill.danger"
  | "fill.warning"
  | "fill.success"
  | "fill.info"
  | "feedback.danger"
  | "feedback.warning"
  | "feedback.success"
  | "feedback.info"
  /** Pending and secondary states that still need their hue, such as a running tool's icon. */
  | "feedback.danger.subtle"
  | "feedback.warning.subtle"
  | "feedback.success.subtle"
  | "feedback.info.subtle"
  /** Ends of the gradient used by the wordmark, the hatching and the spinner. */
  | "gradient.from"
  | "gradient.to"
  /** Hatching and prompt marks that frame things without asking to be read. */
  | "ornament"
  | "ornament.subtle";

/** A ramp's steps, light to dark, Tailwind style. */
export type Step = 50 | 100 | 150 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 850 | 900 | 950;

/** One hue in light-to-dark steps. */
export interface RampSpec {
  readonly hue: number;
  /** Chroma at the ramp's middle; the ends fade toward gray so light and dark steps stay calm. */
  readonly chroma: number;
  /** Added to every step's lightness, to darken (negative) or lighten a ramp as a whole. */
  readonly shift?: number;
  /**
   * Added to the lightness of steps 300 and lighter, which hold a neutral ramp's text, so text can
   * dim without moving the surfaces.
   */
  readonly textShift?: number;
  readonly steps: ReadonlyArray<Step>;
}

export type RampName = "neutral" | "accent" | "danger" | "warning" | "success" | "info";

/** A near-colorless base and a single accent, with the status hues beside them. */
export interface Palette {
  readonly id: string;
  readonly name: string;
  readonly mood: string;
  /** Why these colors belong together. */
  readonly rationale: string;
  readonly ramps: Readonly<Record<RampName, RampSpec>>;
}
