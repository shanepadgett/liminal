/** Text that runs from light accent to dark, one color per letter. */

import { For } from "solid-js";

import { type Mix, useColor, useMix } from "../colors.ts";

const graphemes = new Intl.Segmenter();

/** The terminal cells of `text`: one grapheme each. */
export const cellsOf = (text: string): readonly string[] =>
  Array.from(graphemes.segment(text), (part) => part.segment);

/** Colors for `count` cells spread evenly from `from` to `to`. */
export const gradientOf = (mix: Mix, from: string, to: string, count: number): readonly string[] =>
  Array.from({ length: count }, (_, cell) => mix(from, to, count < 2 ? 0 : cell / (count - 1)));

export function Gradient(props: { readonly text: string; readonly bold?: boolean }) {
  const color = useColor();
  const mix = useMix();
  const letters = () => cellsOf(props.text);

  const colors = () =>
    gradientOf(mix, color("gradient.from"), color("gradient.to"), letters().length);

  return (
    <text flexShrink={0} wrapMode="none">
      <For each={letters()}>
        {(letter, index) => (
          <span style={{ fg: colors()[index()] ?? "", bold: props.bold ?? false }}>{letter}</span>
        )}
      </For>
    </text>
  );
}
