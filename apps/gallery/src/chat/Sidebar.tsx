/**
 * The session sidebar. It runs the full height on the right, set off from the chat column by one
 * vertical line, and holds what is true of the whole session rather than one message: the folder
 * and git branch Liminal runs in, the context the latest call used with how close the next
 * checkpoint is and the memories written, what the session cost, the commands left running and the
 * attached references.
 */

import type { JSX } from "@opentui/solid";

import type { RoleColor, RoleName } from "@liminal/sdk/tui";

import { Section } from "./Section.tsx";

/** The sidebar's width, its border included; it docks when the chat keeps 80 columns beside it. */
export const SIDEBAR_COLUMNS = 42;

/** A label on the left and its value on the right, the value in `tone` when given. */
function Stat(props: {
  readonly color: RoleColor;
  readonly label: string;
  readonly value: string;
  readonly tone?: RoleName;
}) {
  return (
    <box flexDirection="row" height={1}>
      <text wrapMode="none" flexGrow={1} fg={props.color("text.muted")}>
        {props.label}
      </text>
      <text wrapMode="none" flexShrink={0} fg={props.color(props.tone ?? "text.base")}>
        {props.value}
      </text>
    </box>
  );
}

/** A section title over its lines. */
function Block(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly children: JSX.Element;
}) {
  return (
    <box flexDirection="column">
      <Section color={props.color} title={props.title} />
      <box flexDirection="column" marginTop={1}>
        {props.children}
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
      <Block color={props.color} title="Session">
        <Stat color={props.color} label="folder" value="~/dev/open-source/liminal" />
        <Stat color={props.color} label="branch" value="main" />
      </Block>
      <Block color={props.color} title="Context">
        <Stat color={props.color} label="used" value="152K · 58%" />
        <Stat color={props.color} label="window" value="262K" />
        <Stat color={props.color} label="cache hit" value="91%" />
        <Stat color={props.color} label="budget" value="152K · 76%" tone="feedback.warning" />
        <Stat color={props.color} label="short-term" value="4" />
        <Stat color={props.color} label="long-term" value="1" />
        <Stat color={props.color} label="checkpoints" value="2" />
      </Block>
      <Block color={props.color} title="Cost">
        <Stat color={props.color} label="session" value="$1.24" />
        <Stat color={props.color} label="today" value="$3.87" />
      </Block>
      <Block color={props.color} title="Processes">
        <Stat color={props.color} label="p1 bun run dev" value="running" tone="feedback.success" />
        <Stat
          color={props.color}
          label="p2 bun test --watch"
          value="exited 1"
          tone="feedback.danger"
        />
      </Block>
      <Block color={props.color} title="References">
        <text wrapMode="none" fg={props.color("text.muted")}>
          effect
        </text>
        <text wrapMode="none" fg={props.color("text.muted")}>
          lipgloss
        </text>
      </Block>
    </box>
  );
}
