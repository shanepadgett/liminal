/**
 * The chat screen's side column: where the session runs, then usage's section with the share of the
 * model's context window the latest step used, that step's tokens, the share read from the cache
 * and what the session's steps cost; then memory's section with how many memories and checkpoints
 * the session has, once it has a memory. The title is in the header and the model by the composer,
 * so neither is repeated here. It fills the width the chat screen gives it.
 */

import { Show } from "solid-js";

import { Section } from "../../primitives/Section.tsx";
import { useColor } from "../../theme/theme.tsx";

/** Share of the context window past which the note turns to the warning color. */
const NEAR_LIMIT = 0.8;

const THOUSAND = 1000;
const MILLION = 1_000_000;

export interface SidebarUsage {
  /** The tokens the latest step sent. */
  readonly context: number;
  /** The model's context window; left out when no one knows it. */
  readonly contextWindow?: number;
  /** The share of the latest step's input read from the cache, from 0 to 1. */
  readonly cacheHit: number;
  /** What the session's priced steps cost; left out when the model has no price. */
  readonly cost?: number;
  /** The steps whose model has no price. */
  readonly unpriced: number;
}

export interface SidebarMemory {
  /** Every memory the session holds, compacted ones included. */
  readonly memories: number;
  readonly checkpoints: number;
  /** The small model is writing or compacting a memory now. */
  readonly writing: boolean;
}

/** `1 memory` or `12 memories`. */
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** `840`, `84K` or `1.2M`. */
const tokensText = (count: number) => {
  if (count < THOUSAND) return String(count);
  if (count < MILLION) return `${Math.round(count / THOUSAND)}K`;

  return `${(count / MILLION).toFixed(1)}M`;
};

/** `12.4%`. */
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

/** The share of the window in use; zero before the first step, none when the window is unknown. */
const shareOf = (usage: SidebarUsage) => {
  const window = usage.contextWindow;
  if (usage.context === 0) return 0;

  return window === undefined || window === 0 ? undefined : Math.min(1, usage.context / window);
};

/** A value and the faint words after it. */
function Row(props: { readonly value: string; readonly label: string }) {
  const color = useColor();

  return (
    <text wrapMode="none">
      <span style={{ fg: color("text.muted") }}>{props.value}</span>
      <span style={{ fg: color("text.faint") }}>{` ${props.label}`}</span>
    </text>
  );
}

function Cost(props: { readonly usage: SidebarUsage }) {
  const unpriced = () => props.usage.unpriced;

  return (
    <>
      <Show
        when={props.usage.cost !== undefined}
        fallback={<Row value="no" label="price for this model" />}
      >
        <Row value={`$${(props.usage.cost ?? 0).toFixed(2)}`} label="spent" />
      </Show>
      <Show when={props.usage.cost !== undefined && unpriced() > 0}>
        <Row
          value={String(unpriced())}
          label={unpriced() === 1 ? "step unpriced" : "steps unpriced"}
        />
      </Show>
    </>
  );
}

function UsageSection(props: { readonly usage: SidebarUsage }) {
  const share = () => shareOf(props.usage);
  const window = () => props.usage.contextWindow;

  return (
    <Section
      title="Usage"
      note={share() === undefined ? undefined : percent(share() ?? 0)}
      noteRole={(share() ?? 0) > NEAR_LIMIT ? "feedback.warning" : "text.muted"}
    >
      <Row
        value={tokensText(props.usage.context)}
        label={window() === undefined ? "tokens" : `of ${tokensText(window() ?? 0)} tokens`}
      />
      <Row value={percent(props.usage.cacheHit)} label="from cache" />
      <Cost usage={props.usage} />
    </Section>
  );
}

function MemorySection(props: { readonly memory: SidebarMemory }) {
  const memories = () => props.memory.memories;
  const checkpoints = () => props.memory.checkpoints;

  return (
    <Section title="Memory" note={props.memory.writing ? "writing" : undefined}>
      <Row value={String(memories())} label={plural(memories(), "memory", "memories")} />
      <Row
        value={String(checkpoints())}
        label={plural(checkpoints(), "checkpoint", "checkpoints")}
      />
    </Section>
  );
}

export function Sidebar(props: {
  readonly folder: string;
  /** Left out when the folder is not a Git repository. */
  readonly branch?: string;
  readonly usage: SidebarUsage;
  /** Left out until the session's first memory. */
  readonly memory?: SidebarMemory;
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
      <UsageSection usage={props.usage} />
      <Show when={props.memory}>{(memory) => <MemorySection memory={memory()} />}</Show>
    </box>
  );
}
