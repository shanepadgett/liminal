/**
 * One row of cells that fills the width it is given and, while playing, redraws on every frame. The
 * drawing gets the row's width in columns and the phase of the loop, from 0 to 1.
 */

import type { BoxRenderable } from "@opentui/core";
import { useTimeline } from "@opentui/solid";
import { createEffect, createSignal } from "solid-js";

import { Cells } from "./Cells.tsx";
import type { Cell } from "./fade.ts";

export type DrawTrack = (columns: number, phase: number) => readonly Cell[];

export function Track(props: {
  readonly isPlaying: boolean;
  readonly periodMs: number;
  readonly draw: DrawTrack;
}) {
  const [columns, setColumns] = createSignal(0);
  const [phase, setPhase] = createSignal(0);
  const [row, setRow] = createSignal<BoxRenderable>();

  const loop = { phase: 0 };
  const timeline = useTimeline({ duration: props.periodMs, loop: true, autoplay: false });

  timeline.add(loop, {
    phase: 1,
    duration: props.periodMs,
    ease: "linear",
    onUpdate: () => setPhase(loop.phase),
  });

  createEffect(() => {
    if (props.isPlaying) timeline.play();
    else timeline.pause();
  });

  return (
    <box
      ref={setRow}
      height={1}
      flexShrink={0}
      overflow="hidden"
      onSizeChange={() => setColumns(row()?.width ?? 0)}
    >
      <Cells cells={props.draw(columns(), phase())} />
    </box>
  );
}
