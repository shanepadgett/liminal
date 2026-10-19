/**
 * Usage's TUI part: the sidebar's Context and Cost sections. Context is the latest call's tokens
 * out of the model's window and how much of its request the cache served; Cost adds up the
 * session's calls.
 */

import type { JSX } from "@opentui/solid";
import { Effect, Option, Stream } from "effect";
import { type Accessor, Show } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import {
  defineTui,
  formatShare,
  formatTokens,
  makeBridge,
  SidebarNote,
  SidebarSection,
  SidebarStat,
  TuiHost,
} from "@liminal/sdk/tui";

import { type SessionUsage, UsageRpcs } from "./contract.ts";

const NO_CALL = "No model call yet";

/** `84K · 42%`, or `84K` when the window is unknown. */
const usedText = (usage: SessionUsage) =>
  usage.contextWindow === undefined || usage.contextWindow === 0
    ? formatTokens(usage.context)
    : `${formatTokens(usage.context)} · ${formatShare(usage.context / usage.contextWindow)}`;

const costText = (cost: number) => `$${cost.toFixed(2)}`;

function Context(props: { readonly usage: SessionUsage }) {
  return (
    <SidebarSection title="Context">
      <SidebarStat label="used" value={usedText(props.usage)} />
      <Show when={props.usage.contextWindow}>
        {(window) => <SidebarStat label="window" value={formatTokens(window())} />}
      </Show>
      <SidebarStat
        label="cache hit"
        value={props.usage.cacheHit === undefined ? "–" : formatShare(props.usage.cacheHit)}
      />
    </SidebarSection>
  );
}

function Cost(props: { readonly usage: SessionUsage }) {
  return (
    <SidebarSection title="Cost">
      <Show
        when={props.usage.cost !== undefined}
        fallback={<SidebarNote text="No price for this model" />}
      >
        <SidebarStat label="session" value={costText(props.usage.cost ?? 0)} />
      </Show>
      <Show when={props.usage.cost !== undefined && props.usage.unpriced > 0}>
        <SidebarStat
          label="unpriced"
          value={`${props.usage.unpriced} ${props.usage.unpriced === 1 ? "model" : "models"}`}
        />
      </Show>
    </SidebarSection>
  );
}

type Watch = (session: SessionId) => Accessor<Option.Option<SessionUsage>>;

/** A section drawn from the session's usage, `title` over a note before its first reply. */
const makeSection = (
  title: string,
  watch: Watch,
  Shown: (props: { readonly usage: SessionUsage }) => JSX.Element,
) =>
  function UsageSection(props: { readonly sessionId: SessionId }) {
    const usage = watch(props.sessionId);

    return (
      <Show
        when={Option.getOrUndefined(usage())}
        fallback={
          <SidebarSection title={title}>
            <SidebarNote text={NO_CALL} />
          </SidebarSection>
        }
      >
        {(shown) => <Shown usage={shown()} />}
      </Show>
    );
  };

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const client = yield* host.client(UsageRpcs);

    const watch = (session: SessionId) =>
      bridge.watch(
        client["usage/session"]({ session }).pipe(Stream.map(Option.some)),
        Option.none<SessionUsage>(),
      );

    yield* host.register(
      ChatSlots.sidebar,
      { id: "context", order: 0 },
      makeSection("Context", watch, Context),
    );

    yield* host.register(
      ChatSlots.sidebar,
      { id: "cost", order: 10 },
      makeSection("Cost", watch, Cost),
    );
  }),
});
