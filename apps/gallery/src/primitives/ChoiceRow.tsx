/**
 * One row of a list inside the composer, such as a command matching a typed `/` or an answer to an
 * ask. The row under the cursor gets a bold pointer, a chevron unless the list picks another, and a
 * brighter label; labels sit in one column so the details line up. A row that can be picked shows a
 * ring, filled once picked.
 */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { Show } from "solid-js";

import { useColor } from "../theme/theme.tsx";
import { MatchedText } from "./MatchedText.tsx";

/** Whether a pickable row is picked; left out for rows that only run something. */
export type Pick = "picked" | "unpicked";

/** As wide as the composer's gutter, so a menu's labels start where the draft does. */
export const POINTER_COLUMNS = 3;

/** A pickable row's ring and the space after it. */
export const RING_COLUMNS = 2;

export const POINTER = "❯";

function Ring(props: { readonly pick: Pick }) {
  const color = useColor();

  return (
    <text flexShrink={0} fg={color(props.pick === "picked" ? "text.accent" : "text.ghost")}>
      {props.pick === "picked" ? "● " : "○ "}
    </text>
  );
}

interface LabelProps {
  readonly label: string;
  /** Drawn dimmed after the label, inside its column, such as a command's `[guidance]`. */
  readonly suffix?: string | undefined;
  readonly detail?: string | undefined;
  /** Indexes of the letters a filter matched in the label. */
  readonly matches?: readonly number[];
  /** The label column's width, so details line up across rows. */
  readonly labelColumns: number;
  readonly isUnder: boolean;
}

function Label(props: LabelProps) {
  const color = useColor();

  return (
    <>
      <box width={props.labelColumns} flexShrink={0} flexDirection="row">
        <MatchedText
          text={props.label}
          matches={props.matches ?? []}
          role={props.isUnder ? "text.heading" : "text.base"}
        />
        <Show when={props.suffix}>
          {(suffix) => <text fg={color("text.ghost")}>{` ${suffix()}`}</text>}
        </Show>
      </box>
      <text
        flexShrink={1}
        wrapMode="none"
        truncate
        fg={color(props.isUnder ? "text.muted" : "text.faint")}
      >
        {props.detail ?? ""}
      </text>
    </>
  );
}

export function ChoiceRow(
  props: LabelProps & {
    readonly pick?: Pick | undefined;
    /** The glyph marking the row under the cursor. */
    readonly pointer?: string;
    /** Drawn in place of the label and detail, such as a field. */
    readonly children?: JSX.Element;
  },
) {
  const color = useColor();

  return (
    <box flexDirection="row" height={1}>
      <text
        width={POINTER_COLUMNS}
        flexShrink={0}
        fg={color("text.accent")}
        attributes={TextAttributes.BOLD}
      >
        {props.isUnder ? (props.pointer ?? POINTER) : ""}
      </text>
      <Show when={props.pick}>{(pick) => <Ring pick={pick()} />}</Show>
      <Show when={props.children} fallback={<Label {...props} />}>
        {props.children}
      </Show>
    </box>
  );
}

/** The widest label and two columns of space. */
export const labelColumnsOf = (labels: readonly string[]) =>
  Math.max(0, ...labels.map((label) => Bun.stringWidth(label))) + 2;
