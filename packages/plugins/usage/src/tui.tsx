/**
 * Usage's TUI part: the sidebar's Context and Cost sections. Context is the latest call's tokens
 * out of the model's window and how much of its request the cache served; Cost adds up the
 * session's calls and every session's calls since local midnight.
 */

import type { JSX } from "@opentui/solid";
import { Effect } from "effect";
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

import { type SessionUsage, type UsageReport, UsageRpcs } from "./contract.ts";

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

/** The session's line: its cost, or why there is none. */
function SessionCost(props: { readonly usage: SessionUsage | undefined }) {
  return (
    <Show when={props.usage} fallback={<SidebarNote text={NO_CALL} />}>
      {(usage) => (
        <Show when={usage().cost} keyed fallback={<SidebarNote text="No price for this model" />}>
          {(cost) => <SidebarStat label="session" value={costText(cost)} />}
        </Show>
      )}
    </Show>
  );
}

function Cost(props: { readonly report: UsageReport }) {
  const unpriced = () =>
    props.report.session?.cost === undefined ? 0 : props.report.session.unpriced;

  return (
    <SidebarSection title="Cost">
      <SessionCost usage={props.report.session} />
      <Show when={unpriced() > 0}>
        <SidebarStat
          label="unpriced"
          value={`${unpriced()} ${unpriced() === 1 ? "model" : "models"}`}
        />
      </Show>
      <Show when={props.report.today !== undefined}>
        <SidebarStat label="today" value={costText(props.report.today ?? 0)} />
      </Show>
    </SidebarSection>
  );
}

/** Context before the session's first reply. */
function ContextSection(props: { readonly report: UsageReport }) {
  return (
    <Show
      when={props.report.session}
      fallback={
        <SidebarSection title="Context">
          <SidebarNote text={NO_CALL} />
        </SidebarSection>
      }
    >
      {(usage) => <Context usage={usage()} />}
    </Show>
  );
}

type Watch = (session: SessionId) => Accessor<UsageReport>;

/** A sidebar section drawn from the session's report. */
const makeSection =
  (watch: Watch, Shown: (props: { readonly report: UsageReport }) => JSX.Element) =>
  (props: { readonly sessionId: SessionId }) => {
    const report = watch(props.sessionId);

    return <Shown report={report()} />;
  };

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const client = yield* host.client(UsageRpcs);

    const watch = (session: SessionId) => bridge.watch(client["usage/session"]({ session }), {});

    yield* host.register(
      ChatSlots.sidebar,
      { id: "context", order: 0 },
      makeSection(watch, ContextSection),
    );

    yield* host.register(ChatSlots.sidebar, { id: "cost", order: 10 }, makeSection(watch, Cost));
  }),
});
