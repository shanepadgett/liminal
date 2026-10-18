/**
 * The header's reload item: `ctrl+r reload` (or `restart`) once a checked change waits, or `reload
 * failed` and the first line of the reason.
 */

import type { RoleColor } from "@liminal/sdk/tui";

/** A reload the header shows: ready to apply, or failed its check. */
export type ReloadShown =
  | { readonly kind: "ready"; readonly restart: boolean }
  | { readonly kind: "failed"; readonly reason: string };

/** The longest part of a failure reason the header shows. */
const REASON_COLUMNS = 48;

/** The words after the lead: the action when ready, the reason's first line, cut, when failed. */
const detailOf = (reload: ReloadShown) => {
  if (reload.kind === "ready") return reload.restart ? "restart" : "reload";
  const line = reload.reason.trim().split("\n", 1).at(0) ?? "";

  return line.length <= REASON_COLUMNS ? line : `${line.slice(0, REASON_COLUMNS - 1)}…`;
};

export function ReloadStatus(props: { readonly color: RoleColor; readonly reload: ReloadShown }) {
  const isFailed = () => props.reload.kind === "failed";

  return (
    <text wrapMode="none" flexShrink={0} paddingLeft={1}>
      <span style={{ fg: props.color(isFailed() ? "feedback.danger" : "text.muted") }}>
        {isFailed() ? "reload failed" : "ctrl+r"}
      </span>
      <span style={{ fg: props.color("text.faint") }}>{` ${detailOf(props.reload)}`}</span>
    </text>
  );
}
