/**
 * The line for what the assistant is doing right now: a turning arc, the action in the present
 * tense with light sweeping across it, and how long it has run once that is worth saying.
 */

import { Index, Show } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { formatDuration } from "../transcript/duration.ts";
import { SHIMMER_PERIOD_MS, shimmerColors } from "./shimmer.ts";
import { useClock } from "./useClock.ts";

const ARC = ["◜", "◝", "◞", "◟"] as const;

/** How long each arc is shown. Divides the shimmer period, so the two loop together. */
const ARC_MS = 150;

/** An action shows its time only after this many seconds, so quick ones stay quiet. */
const ELAPSED_AFTER_SECONDS = 3;

export function LiveLine(props: {
  readonly color: RoleColor;
  readonly label: string;
  readonly seconds: number;
}) {
  const ms = useClock(SHIMMER_PERIOD_MS);

  const colors = () =>
    shimmerColors(
      props.label.length,
      ms() / SHIMMER_PERIOD_MS,
      props.color("text.muted"),
      props.color("text.heading"),
    );

  return (
    <box flexDirection="row" height={1} gap={1}>
      <text wrapMode="none" flexShrink={0} fg={props.color("text.accent")}>
        {ARC[Math.floor(ms() / ARC_MS) % ARC.length]}
      </text>
      <text wrapMode="none" truncate flexShrink={1}>
        <Index each={props.label.split("")}>
          {(char, index) => <span style={{ fg: colors()[index] }}>{char()}</span>}
        </Index>
      </text>
      <box flexGrow={1} />
      <Show when={props.seconds >= ELAPSED_AFTER_SECONDS}>
        <text wrapMode="none" flexShrink={0} fg={props.color("text.faint")}>
          {formatDuration(Math.floor(props.seconds))}
        </text>
      </Show>
    </box>
  );
}
