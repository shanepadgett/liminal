/**
 * A field of diagonals, the gallery's ornament. With a width it runs the gradient end to end;
 * without one it fills the rest of its row in one quiet color. While scanning, a band of light
 * glides back and forth along it, brightening the lines it passes.
 */

import type { BoxRenderable } from "@opentui/core";
import { useTimeline } from "@opentui/solid";
import { type Accessor, createSignal, For, Show } from "solid-js";

import { useColor, useMix } from "../colors.ts";
import { gradientOf } from "./Gradient.tsx";

const DIAGONAL = "╱";

/** Cells on each side of the band's center that it lights, fading out. */
const SCAN_REACH = 5;

/** One pass of the band from one end to the other. */
const PASS_MILLISECONDS = 1800;

/**
 * Where the band's center is, from 0 at the left end to 1 at the right, gliding there and back and
 * slowing at each end.
 */
const useSweep = (): Accessor<number> => {
  const [position, setPosition] = createSignal(0);
  const timeline = useTimeline({ duration: 2 * PASS_MILLISECONDS, loop: true });

  // The timeline moves `trip.at` from 0 to 2 each round trip; each update eases it into the signal.
  const trip = { at: 0 };

  timeline.add(trip, {
    at: 2,
    duration: 2 * PASS_MILLISECONDS,
    onUpdate: () => {
      const along = trip.at <= 1 ? trip.at : 2 - trip.at;

      setPosition((1 - Math.cos(Math.PI * along)) / 2);
    },
  });

  return position;
};

/** How lit a cell is, from 0 outside the band to 1 at its center. */
const lightAt = (cell: number, center: number) =>
  Math.max(0, 1 - Math.abs(cell - center) / SCAN_REACH) ** 2;

function Cells(props: { readonly colors: readonly string[] }) {
  return (
    <text flexShrink={0} wrapMode="none">
      <For each={props.colors}>{(fg) => <span style={{ fg }}>{DIAGONAL}</span>}</For>
    </text>
  );
}

/** The base colors with the band of light laid over them. */
function Scanned(props: { readonly colors: readonly string[] }) {
  const color = useColor();
  const mix = useMix();
  const position = useSweep();

  const lit = () => {
    const center = position() * (props.colors.length - 1);

    return props.colors.map((fg, cell) => mix(fg, color("gradient.from"), lightAt(cell, center)));
  };

  return <Cells colors={lit()} />;
}

export function Hatch(props: { readonly width?: number; readonly isScanning?: boolean }) {
  const color = useColor();
  const mix = useMix();
  const [filled, setFilled] = createSignal(0);
  const [box, setBox] = createSignal<BoxRenderable>();

  const colors = () =>
    props.width === undefined
      ? Array.from({ length: filled() }, () => color("ornament"))
      : gradientOf(mix, color("gradient.from"), color("gradient.to"), props.width);

  return (
    <box
      ref={setBox}
      flexGrow={props.width === undefined ? 1 : 0}
      flexShrink={props.width === undefined ? 1 : 0}
      flexBasis={props.width ?? 0}
      height={1}
      overflow="hidden"
      onSizeChange={() => {
        setFilled(box()?.width ?? 0);
      }}
    >
      <Show when={props.isScanning} fallback={<Cells colors={colors()} />}>
        <Scanned colors={colors()} />
      </Show>
    </box>
  );
}
