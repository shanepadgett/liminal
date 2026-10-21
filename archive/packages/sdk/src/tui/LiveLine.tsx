/**
 * The line for what the assistant is doing right now: a turning arc, the action in the present
 * tense with light sweeping across it, and how long it has run once that is worth saying.
 */

import { Index, Show } from "solid-js";

import { Arc } from "./Arc.tsx";
import { useClock } from "./clock.ts";
import { formatDuration } from "./duration.ts";
import { SHIMMER_PERIOD_MS, shimmerColors } from "./shimmer.ts";
import type { RoleColor } from "./tokens/roles.ts";

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
      <Arc color={props.color} />
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
