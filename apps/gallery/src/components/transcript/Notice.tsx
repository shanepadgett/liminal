/** A line from Liminal itself in the transcript: a retry, a switch, a stop. */

import type { RoleName } from "../../theme/roles.ts";
import { useColor } from "../../theme/theme.tsx";

export type NoticeKind = "info" | "warning" | "error";

const LOOK: Readonly<Record<NoticeKind, { readonly glyph: string; readonly role: RoleName }>> = {
  info: { glyph: "·", role: "text.faint" },
  warning: { glyph: "!", role: "feedback.warning" },
  error: { glyph: "✕", role: "feedback.danger" },
};

export function Notice(props: { readonly kind: NoticeKind; readonly text: string }) {
  const color = useColor();

  return (
    <text flexShrink={0}>
      <span style={{ fg: color(LOOK[props.kind].role) }}>{`${LOOK[props.kind].glyph} `}</span>
      <span style={{ fg: color(props.kind === "error" ? "feedback.danger" : "text.muted") }}>
        {props.text}
      </span>
    </text>
  );
}
