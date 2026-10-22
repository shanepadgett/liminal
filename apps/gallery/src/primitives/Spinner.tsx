/**
 * Shows a turn is working: a row of braille dust that shimmers through the gradient, and a label
 * whose dots count up.
 */

import { useTimeline } from "@opentui/solid";
import { createSignal, For } from "solid-js";

import { mixHex } from "../theme/oklch.ts";
import { useColor } from "../theme/theme.tsx";

const DUST = ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈", "⠃", "⠘", "⠆", "⠰"];

const CELLS = 8;

const FRAME_MILLISECONDS = 60;

/** The timeline loops after this many frames; the pattern never visibly repeats sooner. */
const LOOP_FRAMES = 1000;

/** Frames per step of the label's dots. */
const DOT_FRAMES = 6;

/** Frames for the shimmer to travel the whole row. */
const SHIMMER_FRAMES = 24;

/** A fixed scramble of frame and cell, so every render of a frame looks the same. */
const dustAt = (frame: number, cell: number) =>
  DUST[((Math.imul(frame + 1, 2_654_435_761) ^ Math.imul(cell + 7, 40_503)) >>> 0) % DUST.length]
  ?? DUST[0];

const shimmerAt = (frame: number, cell: number) =>
  (Math.sin((cell / CELLS + frame / SHIMMER_FRAMES) * 2 * Math.PI) + 1) / 2;

/** A frame counter driven by OpenTUI's timeline. */
const useFrame = () => {
  const [frame, setFrame] = createSignal(0);
  const timeline = useTimeline({ duration: LOOP_FRAMES * FRAME_MILLISECONDS, loop: true });

  // The timeline moves `clock.at` itself; each update copies it into the signal.
  const clock = { at: 0 };

  timeline.add(clock, {
    at: LOOP_FRAMES,
    duration: LOOP_FRAMES * FRAME_MILLISECONDS,
    onUpdate: () => {
      setFrame(Math.floor(clock.at));
    },
  });

  return frame;
};

export function Spinner(props: { readonly label: string }) {
  const color = useColor();
  const frame = useFrame();
  const dots = () => ".".repeat(Math.floor(frame() / DOT_FRAMES) % 4);

  return (
    <text flexShrink={0} wrapMode="none">
      <For each={Array.from({ length: CELLS }, (_, cell) => cell)}>
        {(cell) => (
          <span
            style={{
              fg: mixHex(color("gradient.from"), color("gradient.to"), shimmerAt(frame(), cell)),
            }}
          >
            {dustAt(frame(), cell)}
          </span>
        )}
      </For>
      <span style={{ fg: color("text.muted") }}>{` ${props.label}`}</span>
      <span style={{ fg: color("text.faint") }}>{dots()}</span>
    </text>
  );
}
