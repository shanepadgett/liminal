/** A line from Liminal itself in the transcript: a retry, a switch. */

import type { RoleName } from "@shanepadgett/liminal-client";
import { useColor } from "@shanepadgett/liminal-tui";

import type { NoticeLevel } from "../view/index.ts";

const LOOK: Readonly<Record<NoticeLevel, { readonly glyph: string; readonly role: RoleName }>> = {
  info: { glyph: "·", role: "text.faint" },
  warning: { glyph: "!", role: "feedback.warning" },
  error: { glyph: "✕", role: "feedback.danger" },
};

export function Notice(props: { readonly level: NoticeLevel; readonly text: string }) {
  const color = useColor();

  return (
    <text flexShrink={0}>
      <span style={{ fg: color(LOOK[props.level].role) }}>{`${LOOK[props.level].glyph} `}</span>
      <span style={{ fg: color(props.level === "error" ? "feedback.danger" : "text.muted") }}>
        {props.text}
      </span>
    </text>
  );
}
