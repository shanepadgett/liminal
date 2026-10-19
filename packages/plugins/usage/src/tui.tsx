/**
 * Usage's TUI part: the sidebar's Context and Cost sections. Context is the latest call's tokens
 * out of the model's window and how much of its request the cache served, then the rows other
 * plugins register in `UsageSlots.contextRows`; Cost adds up the session's calls and every
 * session's calls since local midnight.
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
  SlotView,
  TuiHost,
} from "@liminal/sdk/tui";

import {
  idleUsage,
  type SessionUsage,
  type UsageReport,
  UsageRpcs,
  UsageSlots,
} from "./contract.ts";

/** `84K · 42%`, or `84K` when the window is unknown. */
const usedText = (usage: SessionUsage) =>
  usage.contextWindow === undefined || usage.contextWindow === 0
    ? formatTokens(usage.context)
    : `${formatTokens(usage.context)} · ${formatShare(usage.context / usage.contextWindow)}`;

const costText = (cost: number) => `$${cost.toFixed(2)}`;

function Context(props: { readonly usage: SessionUsage; readonly sessionId: SessionId }) {
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
      <SlotView of={UsageSlots.contextRows} props={{ sessionId: props.sessionId }} />
    </SidebarSection>
  );
}

/** The session's line: its cost, or that its model has no price. */
function SessionCost(props: { readonly usage: SessionUsage }) {
  return props.usage.cost === undefined ? (
    <SidebarNote text="No price for this model" />
  ) : (
    <SidebarStat label="session" value={costText(props.usage.cost)} />
  );
}

function Cost(props: { readonly report: UsageReport }) {
  const unpriced = () =>
    props.report.session.cost === undefined ? 0 : props.report.session.unpriced;

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

function ContextSection(props: { readonly report: UsageReport; readonly sessionId: SessionId }) {
  return <Context usage={props.report.session} sessionId={props.sessionId} />;
}

type Watch = (session: SessionId) => Accessor<UsageReport>;

/** A sidebar section drawn from the session's report. */
const makeSection =
  (
    watch: Watch,
    Shown: (props: { readonly report: UsageReport; readonly sessionId: SessionId }) => JSX.Element,
  ) =>
  (props: { readonly sessionId: SessionId }) => {
    const report = watch(props.sessionId);

    return <Shown report={report()} sessionId={props.sessionId} />;
  };

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const client = yield* host.client(UsageRpcs);

    const watch = (session: SessionId) =>
      bridge.watch(client["usage/session"]({ session }), { session: idleUsage() });

    yield* host.register(
      ChatSlots.sidebar,
      { id: "context", order: 0 },
      makeSection(watch, ContextSection),
      [UsageSlots.contextRows],
    );

    yield* host.register(ChatSlots.sidebar, { id: "cost", order: 10 }, makeSection(watch, Cost));
  }),
});
