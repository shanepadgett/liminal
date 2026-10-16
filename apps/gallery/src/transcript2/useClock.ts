/**
 * Milliseconds into a loop of `periodMs`, updated as frames draw. Every moving part of the
 * transcript reads one of these, so its motion is a pure function of the time.
 */

import { useTimeline } from "@opentui/solid";
import { createSignal } from "solid-js";

/** Time moves in steps of this many milliseconds, so a frame that changes nothing redraws nothing. */
const STEP_MS = 40;

export const useClock = (periodMs: number) => {
  const [ms, setMs] = createSignal(0);
  const loop = { ms: 0 };
  const timeline = useTimeline({ duration: periodMs, loop: true });

  timeline.add(loop, {
    ms: periodMs,
    duration: periodMs,
    ease: "linear",
    onUpdate: () => setMs(Math.floor(loop.ms / STEP_MS) * STEP_MS),
  });

  return ms;
};
