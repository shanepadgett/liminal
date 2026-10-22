/** A short label on a solid fill: a status, a mode or a count. */

import type { RoleName } from "../theme/roles.ts";
import { useColor } from "../theme/theme.tsx";

export type Tone = "accent" | "danger" | "warning" | "success" | "info" | "quiet";

const FILL: Readonly<Record<Tone, RoleName>> = {
  accent: "fill.accent",
  danger: "fill.danger",
  warning: "fill.warning",
  success: "fill.success",
  info: "fill.info",
  quiet: "surface.selected",
};

export function Chip(props: { readonly label: string; readonly tone: Tone }) {
  const color = useColor();

  return (
    <text flexShrink={0}>
      <span
        style={{
          bg: color(FILL[props.tone]),
          fg: color(props.tone === "quiet" ? "text.muted" : "text.inverse"),
          bold: true,
        }}
      >
        {` ${props.label} `}
      </span>
    </text>
  );
}
