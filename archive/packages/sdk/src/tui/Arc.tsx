/** The turning arc that marks something in progress: a live line, or a work row still running. */

import { useClock } from "./clock.ts";
import { SHIMMER_PERIOD_MS } from "./shimmer.ts";
import type { RoleColor } from "./tokens/roles.ts";

const ARC = ["◜", "◝", "◞", "◟"] as const;

/** How long each arc is shown. Divides the shimmer period, so the two loop together. */
const ARC_MS = 150;

export function Arc(props: { readonly color: RoleColor }) {
  const ms = useClock(SHIMMER_PERIOD_MS);

  return (
    <text wrapMode="none" flexShrink={0} fg={props.color("text.accent")}>
      {ARC[Math.floor(ms() / ARC_MS) % ARC.length]}
    </text>
  );
}
