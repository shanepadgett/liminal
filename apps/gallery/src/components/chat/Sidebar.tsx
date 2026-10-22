/**
 * The chat screen's side column: where the session runs, how full its context is and what feeds it,
 * the repositories attached as references and the language servers running. The title is in the
 * header and the model by the composer, so neither is repeated here. It fills the width the chat
 * screen gives it.
 */

import { For, Show } from "solid-js";

import { Section } from "../../primitives/Section.tsx";
import { useColor } from "../../theme/theme.tsx";
import { MEMORY_STARS } from "../transcript/Memory.tsx";

/** Share of the context window past which the percentage turns to the warning color. */
const NEAR_LIMIT = 0.8;

export interface SidebarContext {
  readonly used: number;
  readonly limit: number;
  readonly shortTermMemories: number;
  readonly longTermMemories: number;
  readonly checkpoints: number;
}

/** A count read as a phrase, such as "3 checkpoints", with an optional mark after it. */
function Count(props: {
  readonly count: number;
  readonly one: string;
  readonly many: string;
  readonly mark?: string;
}) {
  const color = useColor();

  return (
    <text wrapMode="none">
      <span style={{ fg: color("text.muted") }}>{String(props.count)}</span>
      <span style={{ fg: color("text.faint") }}>
        {` ${props.count === 1 ? props.one : props.many}`}
      </span>
      <span style={{ fg: color("text.accent") }}>
        {props.mark === undefined ? "" : ` ${props.mark}`}
      </span>
    </text>
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
      <Count
        count={props.context.shortTermMemories}
        one="short-term memory"
        many="short-term memories"
        mark={MEMORY_STARS["short-term"]}
      />
      <Count
        count={props.context.longTermMemories}
        one="long-term memory"
        many="long-term memories"
        mark={MEMORY_STARS["long-term"]}
      />
      <Count count={props.context.checkpoints} one="checkpoint" many="checkpoints" />
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
    <box flexGrow={1} paddingX={2}>
      <Section title="Session">
        <text wrapMode="none" fg={color("text.base")}>
          {props.folder}
        </text>
        <Show when={props.branch}>
          {(branch) => (
            <text wrapMode="none" fg={color("text.muted")}>
              {branch()}
            </text>
          )}
        </Show>
      </Section>
      <ContextSection context={props.context} />
      <Names title="References" names={props.references} />
      <Names title="LSP" names={props.servers} />
    </box>
  );
}
