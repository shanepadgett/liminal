/** The chat screen's side column: the session, its model and how full the context is. */

import { Chip } from "../../primitives/Chip.tsx";
import { Section } from "../../primitives/Section.tsx";
import { useColor } from "../../theme/theme.tsx";

const BAR_CELLS = 24;

/** The left border and two columns of padding on each side. */
const SIDEBAR_FRAME = 5;

/** Share of the context window past which the bar warns. */
const NEAR_LIMIT = 0.8;

export interface SidebarModel {
  readonly provider: string;
  readonly name: string;
  readonly role: string;
}

function ContextBar(props: { readonly used: number; readonly limit: number }) {
  const color = useColor();
  const share = () => Math.min(1, props.used / props.limit);
  const filled = () => Math.round(share() * BAR_CELLS);

  return (
    <box>
      <text>
        <span style={{ fg: color(share() > NEAR_LIMIT ? "fill.warning" : "fill.accent") }}>
          {"━".repeat(filled())}
        </span>
        <span style={{ fg: color("surface.selected") }}>{"━".repeat(BAR_CELLS - filled())}</span>
      </text>
      <text fg={color("text.faint")}>
        {`${Math.round(props.used / 1000)}k of ${Math.round(props.limit / 1000)}k tokens`}
      </text>
    </box>
  );
}

export function Sidebar(props: {
  readonly title: string;
  readonly started: string;
  readonly model: SidebarModel;
  readonly used: number;
  readonly limit: number;
}) {
  const color = useColor();

  return (
    <box
      width={BAR_CELLS + SIDEBAR_FRAME}
      flexShrink={0}
      paddingX={2}
      paddingTop={1}
      border={["left"]}
      borderColor={color("border.subtle")}
    >
      <Section title="Session" note={props.started}>
        <text fg={color("text.muted")}>{props.title}</text>
      </Section>
      <Section title="Model">
        <text fg={color("text.base")}>{props.model.name}</text>
        <box flexDirection="row" gap={1}>
          <text fg={color("text.faint")}>{props.model.provider}</text>
          <Chip label={props.model.role} tone="quiet" />
        </box>
      </Section>
      <Section title="Context">
        <ContextBar used={props.used} limit={props.limit} />
      </Section>
    </box>
  );
}
