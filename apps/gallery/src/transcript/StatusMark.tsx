/**
 * The one-cell mark for how a call stands. A running mark breathes between the dim and the bright
 * step of its hue, so a call that runs for a while still shows it is alive without moving anything
 * across the screen.
 */

import { useTimeline } from "@opentui/solid";
import { createSignal, Show } from "solid-js";

import { mixHex } from "../tokens/oklch.ts";
import type { RoleColor } from "../tokens/roles.ts";
import type { ToolStatus } from "./entries.ts";
import { STATUS } from "./status.ts";

/** One breath in and out. */
const BREATH_PERIOD_MS = 2400;

function Breathing(props: { readonly color: RoleColor; readonly glyph: string }) {
  const [phase, setPhase] = createSignal(0);
  const loop = { phase: 0 };
  const timeline = useTimeline({ duration: BREATH_PERIOD_MS, loop: true });

  timeline.add(loop, {
    phase: 1,
    duration: BREATH_PERIOD_MS,
    ease: "linear",
    onUpdate: () => setPhase(loop.phase),
  });

  const brightness = () => (1 - Math.cos(2 * Math.PI * phase())) / 2;

  return (
    <text wrapMode="none" flexShrink={0}>
      <span
        style={{
          fg: mixHex(
            props.color("feedback.success.subtle"),
            props.color("feedback.success"),
            brightness(),
          ),
        }}
      >
        {props.glyph}
      </span>
    </text>
  );
}

export function StatusMark(props: { readonly color: RoleColor; readonly status: ToolStatus }) {
  const status = () => STATUS[props.status];

  return (
    <Show
      when={props.status !== "running"}
      fallback={<Breathing color={props.color} glyph={status().glyph} />}
    >
      <text wrapMode="none" flexShrink={0} fg={props.color(status().role)}>
        {status().glyph}
      </text>
    </Show>
  );
}
