/** Liminal's color names, shared by every frontend. Components name colors by role, never by value. */

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
