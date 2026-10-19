/**
 * The sidebar's Memory section: how much of the budget the context fills, in the warning color from
 * three quarters on, how far the background notes reach, and the checkpoints written.
 */

import { Option } from "effect";
import { type Accessor, Show } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import {
  formatShare,
  formatTokens,
  SidebarNote,
  SidebarSection,
  SidebarStat,
} from "@liminal/sdk/tui";

import type { MemoryStatus } from "../contract.ts";

const budgetText = (status: MemoryStatus) =>
  status.budget <= 0
    ? formatTokens(status.size)
    : `${formatTokens(status.size)} · ${formatShare(status.size / status.budget)}`;

function Status(props: { readonly status: MemoryStatus }) {
  const tone = () =>
    props.status.stage === "warning" || props.status.stage === "forced"
      ? "feedback.warning"
      : "text.base";

  return (
    <>
      <SidebarStat label="budget" value={budgetText(props.status)} tone={tone()} />
      <SidebarStat
        label="short-term"
        value={
          props.status.notesThrough === undefined
            ? "none yet"
            : `through ${props.status.notesThrough}`
        }
      />
      <SidebarStat label="checkpoints" value={String(props.status.checkpoints)} />
    </>
  );
}

export const makeSection = (watch: (session: SessionId) => Accessor<Option.Option<MemoryStatus>>) =>
  function MemorySection(props: { readonly sessionId: SessionId }) {
    const status = watch(props.sessionId);

    return (
      <SidebarSection title="Memory">
        <Show when={Option.getOrUndefined(status())} fallback={<SidebarNote text="No turn yet" />}>
          {(shown) => <Status status={shown()} />}
        </Show>
      </SidebarSection>
    );
  };
