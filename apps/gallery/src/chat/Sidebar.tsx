/**
 * The session sidebar. It runs the full height on the right, set off from the chat column by one
 * vertical line, and holds what is true of the whole session rather than one message.
 */

import { For } from "solid-js";

import type { RoleColor } from "@liminal/sdk/tui";

import { Section } from "./Section.tsx";

export const SIDEBAR_COLUMNS = 36;

type ChangedFile = { readonly path: string; readonly added: number; readonly removed: number };

const CHANGED_FILES: readonly ChangedFile[] = [
  { path: "kernel/test/plugin-host-lifecycle.test.ts", added: 18, removed: 4 },
  { path: "kernel/src/host.ts", added: 3, removed: 1 },
];

/** A label on the left and its value on the right. */
function Stat(props: {
  readonly color: RoleColor;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <box flexDirection="row" height={1}>
      <text wrapMode="none" flexGrow={1} fg={props.color("text.muted")}>
        {props.label}
      </text>
      <text wrapMode="none" flexShrink={0} fg={props.color("text.base")}>
        {props.value}
      </text>
    </box>
  );
}

function Session(props: { readonly color: RoleColor }) {
  return (
    <box flexDirection="column">
      <Section color={props.color} title="Session" />
      <text wrapMode="none" truncate marginTop={1} fg={props.color("text.base")}>
        ~/dev/open-source/liminal/apps/gallery
      </text>
      <text wrapMode="none" truncate fg={props.color("text.accent")}>
        feature/sidebar-session-stats
      </text>
      <Stat color={props.color} label="context" value="84K · 42%" />
      <Stat color={props.color} label="cache hit" value="91%" />
      <Stat color={props.color} label="session" value="$1.24" />
      <Stat color={props.color} label="today" value="$8.70" />
    </box>
  );
}

function Files(props: { readonly color: RoleColor }) {
  return (
    <box flexDirection="column">
      <Section color={props.color} title="Files" />
      <box flexDirection="column" marginTop={1}>
        <For each={CHANGED_FILES}>
          {(file) => (
            <box flexDirection="row" height={1}>
              <text
                wrapMode="none"
                truncate
                flexGrow={1}
                flexShrink={1}
                fg={props.color("text.muted")}
              >
                {file.path}
              </text>
              <text wrapMode="none" flexShrink={0}>
                <span style={{ fg: props.color("feedback.success") }}>{` +${file.added}`}</span>
                <span style={{ fg: props.color("feedback.danger") }}>{` -${file.removed}`}</span>
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  );
}

export function Sidebar(props: { readonly color: RoleColor }) {
  return (
    <box
      width={SIDEBAR_COLUMNS}
      flexShrink={0}
      flexDirection="column"
      border={["left"]}
      borderColor={props.color("border.subtle")}
      paddingX={2}
      paddingTop={1}
      gap={1}
    >
      <Session color={props.color} />
      <Files color={props.color} />
    </box>
  );
}
