/**
 * A memory the model wrote, where it wrote it: a star and a few words in the model's own voice,
 * like a note it says to itself, as bright as a reply. A hollow star is a short-term memory, which
 * sums up the stretch just worked through; a solid one is a long-term memory, kept across
 * sessions.
 */

import { useColor } from "../../theme/theme.tsx";

export type MemoryKind = "short-term" | "long-term";

/** The star that marks each kind of memory, here and in the sidebar. */
export const MEMORY_STARS: Readonly<Record<MemoryKind, string>> = {
  "short-term": "✧",
  "long-term": "✦",
};

export function Memory(props: { readonly kind: MemoryKind; readonly text: string }) {
  const color = useColor();

  return (
    <text flexShrink={0}>
      <span style={{ fg: color("text.accent") }}>{`${MEMORY_STARS[props.kind]} `}</span>
      <i style={{ fg: color("text.base") }}>{props.text}</i>
    </text>
  );
}
