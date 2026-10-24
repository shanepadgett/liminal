/**
 * A memory the model wrote, where it wrote it: a star and a few words in the model's own voice,
 * like a note it says to itself, as bright as a reply. A hollow star is a memory of the stretch
 * just worked through; a solid one compacts older memories into one.
 */

import { useColor } from "../../theme/theme.tsx";

export type MemoryKind = "entries" | "compacted";

/** The star that marks each kind of memory, here and in the sidebar. */
const MEMORY_STARS: Readonly<Record<MemoryKind, string>> = { entries: "✧", compacted: "✦" };

export function Memory(props: { readonly kind: MemoryKind; readonly text: string }) {
  const color = useColor();

  return (
    <text flexShrink={0}>
      <span style={{ fg: color("text.accent") }}>{`${MEMORY_STARS[props.kind]} `}</span>
      <i style={{ fg: color("text.base") }}>{props.text}</i>
    </text>
  );
}
