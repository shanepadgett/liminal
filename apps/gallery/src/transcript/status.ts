/** The glyph and color that lead a tool call's line, by how the call stands. */

import type { RoleName } from "../tokens/roles.ts";
import type { ToolStatus } from "./entries.ts";

export const STATUS: Readonly<
  Record<ToolStatus, { readonly glyph: string; readonly role: RoleName }>
> = {
  running: { glyph: "●", role: "feedback.success.subtle" },
  done: { glyph: "✓", role: "feedback.success" },
  failed: { glyph: "×", role: "feedback.danger" },
};

/** The status a set of calls shows together: any failure wins, then anything still running. */
export const combinedStatus = (statuses: readonly ToolStatus[]): ToolStatus => {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("running")) return "running";

  return "done";
};
