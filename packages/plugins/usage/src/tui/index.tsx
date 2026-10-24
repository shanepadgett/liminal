/**
 * Usage's `tui` entry: the Usage section in chat's sidebar, all zero until the first step finishes.
 * Its note is the share of the model's context window the latest step used; its rows are that
 * step's tokens, the share read from the cache and what the session's steps cost.
 */
import { Effect, Layer, Stream } from "effect";
import { Show } from "solid-js";

import { sidebar, type SidebarProps } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import type { SessionId } from "@shanepadgett/liminal-session/contract";
import { kit, Slots, useColor, useWatch } from "@shanepadgett/liminal-tui";

import { type SessionUsage, UsageRpc } from "../contract.ts";

/** Share of the context window past which the note turns to the warning color. */
const NEAR_LIMIT = 0.8;

const THOUSAND = 1000;
const MILLION = 1_000_000;

/** `840`, `84K` or `1.2M`. */
const tokensText = (count: number) => {
  if (count < THOUSAND) return String(count);
  if (count < MILLION) return `${Math.round(count / THOUSAND)}K`;

  return `${(count / MILLION).toFixed(1)}M`;
};

const percent = (share: number) => `${Math.round(share * 100)}%`;

const usageOf = (session: SessionId) =>
  Stream.unwrap(
    Effect.map(
      Effect.flatMap(Host, (host) => host.client(UsageRpc)),
      (client) => client["usage/session"]({ session }),
    ),
  );

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

function Cost(props: { readonly usage: SessionUsage }) {
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

/** What a session shows before its first step finishes. */
const NOTHING_YET: SessionUsage = { context: 0, cacheHit: 0, cost: 0, unpriced: 0 };

/** The share of the window in use; zero before the first step, none when the window is unknown. */
const shareOf = (usage: SessionUsage) => {
  const window = usage.contextWindow;
  if (usage.context === 0) return 0;

  return window === undefined || window === 0 ? undefined : Math.min(1, usage.context / window);
};

function SessionUsageView(props: { readonly session: SessionId }) {
  const usage = useWatch(usageOf(props.session), NOTHING_YET);
  const share = () => shareOf(usage());
  const window = () => usage().contextWindow;

  return (
    <kit.Section
      title="Usage"
      note={share() === undefined ? undefined : percent(share() ?? 0)}
      noteRole={(share() ?? 0) > NEAR_LIMIT ? "feedback.warning" : "text.muted"}
    >
      <Row
        value={tokensText(usage().context)}
        label={window() === undefined ? "tokens" : `of ${tokensText(window() ?? 0)} tokens`}
      />
      <Row value={percent(usage().cacheHit)} label="from cache" />
      <Cost usage={usage()} />
    </kit.Section>
  );
}

/** A new session on screen follows that session's usage. */
function UsageSection(props: SidebarProps) {
  return (
    <Show when={props.session} keyed>
      {(session) => <SessionUsageView session={session} />}
    </Show>
  );
}

const make = Effect.gen(function* () {
  yield* (yield* Slots).fill(sidebar, UsageSection);
});

export default definePlugin({
  name: "usage-tui",
  provides: [],
  requires: [Slots],
  layer: Layer.effectDiscard(make),
});
