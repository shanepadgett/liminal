/**
 * Memory's rows in the sidebar's Context section: how much of the budget the context fills, in the
 * warning color from three quarters on, the short-term and long-term memories written, and the
 * checkpoints. No rows before the session's first turn, which names the model to measure against.
 */

import { Option } from "effect";
import { type Accessor, Show } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import { formatShare, formatTokens, SidebarField } from "@liminal/sdk/tui";

import type { MemoryStatus } from "../contract.ts";

const budgetText = (status: MemoryStatus) =>
  status.budget <= 0
    ? formatTokens(status.size)
    : `${formatTokens(status.size)} · ${formatShare(status.size / status.budget)}`;

function Rows(props: { readonly status: MemoryStatus }) {
  const tone = () =>
    props.status.stage === "warning" || props.status.stage === "forced"
      ? "feedback.warning"
      : "text.base";

  return (
    <>
      <SidebarField label="budget" value={budgetText(props.status)} tone={tone()} />
      <SidebarField label="short-term" value={String(props.status.shortTerm)} />
      <SidebarField label="long-term" value={String(props.status.longTerm)} />
      <SidebarField label="checkpoints" value={String(props.status.checkpoints)} />
    </>
  );
}

export const makeContextRows = (
  watch: (session: SessionId) => Accessor<Option.Option<MemoryStatus>>,
) =>
  function ContextRows(props: { readonly sessionId: SessionId }) {
    const status = watch(props.sessionId);

    return (
      <Show when={Option.getOrUndefined(status())}>{(shown) => <Rows status={shown()} />}</Show>
    );
  };
