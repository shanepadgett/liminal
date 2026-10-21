/**
 * Liminal's signature ornament: eighth blocks that thicken from a hairline to a full cell, crossing
 * a threshold. Headers draw it as hairlines across their width that thicken into the fade at the
 * right end.
 */

/** Left-aligned eighth blocks, thinnest first. */
export const FADE = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;

export const HAIRLINE = "▏";

export type Cell = { readonly glyph: string; readonly fg: string; readonly bg: string };
