/**
 * What a reply did, one row per tool call: an icon for where it stands, the tool, its target and a
 * note. An edit shows its diff under the row.
 */

import { For, Show } from "solid-js";

import { mixHex } from "../../theme/oklch.ts";
import type { RoleName } from "../../theme/roles.ts";
import { useColor, useTheme } from "../../theme/theme.tsx";

export type WorkStatus = "running" | "done" | "failed";

export interface WorkRow {
  readonly tool: string;
  readonly target: string;
  readonly status: WorkStatus;
  readonly note?: string;
  /** A unified diff, for an edit. */
  readonly diff?: string;
}

const ICON: Readonly<Record<WorkStatus, { readonly glyph: string; readonly role: RoleName }>> = {
  running: { glyph: "●", role: "text.accent" },
  done: { glyph: "✓", role: "feedback.success" },
  failed: { glyph: "×", role: "feedback.danger" },
};

const TOOL_COLUMNS = 6;

/** How much of the status color tints a diff line's background. */
const DIFF_TINT = 0.14;

function Diff(props: { readonly diff: string }) {
  const theme = useTheme();
  const color = useColor();
  const tint = (role: RoleName) => mixHex(color("surface.base"), color(role), DIFF_TINT);

  return (
    <box paddingLeft={2} marginY={1}>
      <diff
        diff={props.diff}
        view="unified"
        filetype="typescript"
        syntaxStyle={theme().syntax}
        showLineNumbers
        lineNumberFg={color("text.ghost")}
        lineNumberBg={color("surface.base")}
        contextBg={color("surface.base")}
        addedBg={tint("feedback.success")}
        removedBg={tint("feedback.danger")}
        addedSignColor={color("feedback.success")}
        removedSignColor={color("feedback.danger")}
      />
    </box>
  );
}

function Row(props: { readonly row: WorkRow }) {
  const color = useColor();

  return (
    <box>
      <text wrapMode="none">
        <span
          style={{ fg: color(ICON[props.row.status].role) }}
        >{`${ICON[props.row.status].glyph} `}</span>
        <span style={{ fg: color("text.accent") }}>{props.row.tool.padEnd(TOOL_COLUMNS)}</span>
        <span style={{ fg: color("text.muted") }}>{props.row.target}</span>
        <span
          style={{ fg: color(props.row.status === "failed" ? "feedback.danger" : "text.faint") }}
        >
          {props.row.note === undefined ? "" : `  ${props.row.note}`}
        </span>
      </text>
      <Show when={props.row.diff}>{(diff) => <Diff diff={diff()} />}</Show>
    </box>
  );
}

export function WorkRows(props: { readonly rows: readonly WorkRow[] }) {
  return (
    <box flexShrink={0}>
      <For each={props.rows}>{(row) => <Row row={row} />}</For>
    </box>
  );
}
