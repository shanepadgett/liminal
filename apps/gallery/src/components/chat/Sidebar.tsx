/**
 * The chat screen's side column: where the session runs, how full its context is and what feeds it,
 * the repositories attached as references and the language servers running. The title is in the
 * header and the model by the composer, so neither is repeated here.
 */

import { For, Show } from "solid-js";

import { Section } from "../../primitives/Section.tsx";
import { useColor } from "../../theme/theme.tsx";

/** The columns inside the sidebar's padding. */
const CONTENT_COLUMNS = 28;

const PADDING_COLUMNS = 2;

/** Share of the context window past which the percentage turns to the warning color. */
const NEAR_LIMIT = 0.8;

export interface SidebarContext {
  readonly used: number;
  readonly limit: number;
  readonly shortTermMemories: number;
  readonly longTermMemories: number;
  readonly checkpoints: number;
}

/** A label on the left and its value on the right. */
function Row(props: { readonly label: string; readonly value: string | number }) {
  const color = useColor();

  return (
    <box flexDirection="row" gap={1}>
      <text flexGrow={1} wrapMode="none" fg={color("text.faint")}>
        {props.label}
      </text>
      <text flexShrink={0} fg={color("text.muted")}>
        {String(props.value)}
      </text>
    </box>
  );
}

function ContextSection(props: { readonly context: SidebarContext }) {
  const share = () => Math.min(1, props.context.used / props.context.limit);

  return (
    <Section
      title="Context"
      note={`${Math.round(share() * 100)}%`}
      noteRole={share() > NEAR_LIMIT ? "feedback.warning" : "text.muted"}
    >
      <Row label="short-term memories" value={props.context.shortTermMemories} />
      <Row label="long-term memories" value={props.context.longTermMemories} />
      <Row label="checkpoints" value={props.context.checkpoints} />
    </Section>
  );
}

/** A section listing names, left out when there are none. */
function Names(props: { readonly title: string; readonly names: readonly string[] }) {
  const color = useColor();

  return (
    <Show when={props.names.length > 0}>
      <Section title={props.title}>
        <For each={props.names}>
          {(name) => (
            <text wrapMode="none" fg={color("text.muted")}>
              {name}
            </text>
          )}
        </For>
      </Section>
    </Show>
  );
}

export function Sidebar(props: {
  readonly folder: string;
  /** Left out when the folder is not a Git repository. */
  readonly branch?: string;
  readonly context: SidebarContext;
  /** Names of the Git repositories attached as references. */
  readonly references: readonly string[];
  /** Language servers running for this session. */
  readonly servers: readonly string[];
}) {
  const color = useColor();

  return (
    <box width={CONTENT_COLUMNS + 2 * PADDING_COLUMNS} flexShrink={0} paddingX={PADDING_COLUMNS}>
      <Section title="Session">
        <text wrapMode="none" fg={color("text.base")}>
          {props.folder}
        </text>
        <Show when={props.branch}>{(branch) => <Row label="branch" value={branch()} />}</Show>
      </Section>
      <ContextSection context={props.context} />
      <Names title="References" names={props.references} />
      <Names title="LSP" names={props.servers} />
    </box>
  );
}
