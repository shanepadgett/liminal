/**
 * One quiet row of work: a mark, the label in bold, what it worked on, and fainter detail in
 * brackets; a failure shows in the danger color. While the work runs the mark is a turning arc and
 * light sweeps across the label. Each part fades from its current color to a dimmed one as the work
 * is left behind.
 */

import type { BoxRenderable } from "@opentui/core";
import { createSignal, Index, Show } from "solid-js";

import { Arc } from "./Arc.tsx";
import { useClock } from "./clock.ts";
import { SHIMMER_PERIOD_MS, shimmerColors } from "./shimmer.ts";
import { mixHex } from "./tokens/oklch.ts";
import type { RoleColor, RoleName } from "./tokens/roles.ts";
import { cutLine } from "./wrap.ts";

/**
 * A work row's words. The label names the tool or the kind of work and reads the same before and
 * after it ends. A one-line row cuts its subject to fit beside the label and asides; a row whose
 * work is still running turns an arc in place of its mark and shimmers its label.
 */
export interface WorkWording {
  readonly label: string;
  readonly subject: string;
  readonly detail: string;
  readonly failure: string;
  readonly oneLine?: boolean;
  readonly isRunning?: boolean;
}

/** A part of a work row, or the text a row opens to. */
export type WorkPart = "mark" | "label" | "subject" | "detail" | "failure" | "thought";

/** Each part's role while the work is current, and once it has dimmed. */
const PART_ROLES: Readonly<Record<WorkPart, readonly [RoleName, RoleName]>> = {
  mark: ["text.ghost", "text.ghost"],
  label: ["text.muted", "text.ghost"],
  subject: ["text.faint", "text.ghost"],
  detail: ["text.ghost", "text.ghost"],
  failure: ["feedback.danger", "feedback.danger.subtle"],
  thought: ["text.faint", "text.ghost"],
};

/** A part's color, `dim` of the way from current to dimmed. */
export const workColor = (color: RoleColor, part: WorkPart, dim: number) => {
  const [current, dimmed] = PART_ROLES[part];

  return mixHex(color(current), color(dimmed), dim);
};

/** A thought's row: `Thought` and its first line, without the bold a summary heading carries. */
export const thoughtWording = (text: string): WorkWording => ({
  label: "Thought",
  subject: (text.trim().split("\n")[0] ?? "").replaceAll("**", "").trim(),
  detail: "",
  failure: "",
  oneLine: true,
});

const after = (text: string) => (text === "" ? "" : ` ${text}`);

const aside = (text: string) => (text === "" ? "" : ` (${text})`);

/** A label with light sweeping across it, for work that is still running. */
function ShimmeringLabel(props: {
  readonly color: RoleColor;
  readonly text: string;
  readonly dim: number;
}) {
  const ms = useClock(SHIMMER_PERIOD_MS);

  const colors = () =>
    shimmerColors(
      props.text.length,
      ms() / SHIMMER_PERIOD_MS,
      workColor(props.color, "label", props.dim),
      props.color("text.heading"),
    );

  return (
    <Index each={props.text.split("")}>
      {(char, index) => <span style={{ fg: colors()[index] }}>{char()}</span>}
    </Index>
  );
}

/** The mark stands in its own column, so wrapped words line up under the label. */
export function WorkWords(props: {
  readonly color: RoleColor;
  readonly mark: string;
  readonly words: WorkWording;
  /** How far the work has dimmed, from 0 to 1. */
  readonly dim: number;
}) {
  const fg = (part: WorkPart) => workColor(props.color, part, props.dim);
  const [body, setBody] = createSignal<BoxRenderable>();
  const [columns, setColumns] = createSignal(0);

  const detail = () => aside(props.words.detail);
  const failure = () => aside(props.words.failure);
  const isOneLine = () => props.words.oneLine === true;

  const subject = () => {
    const { label, subject: whole } = props.words;
    if (!isOneLine()) return whole;

    return cutLine(whole, columns() - label.length - 1 - detail().length - failure().length);
  };

  return (
    <box flexDirection="row">
      <Show
        when={props.words.isRunning === true}
        fallback={<text fg={fg("mark")} flexShrink={0}>{`${props.mark} `}</text>}
      >
        <box flexDirection="row" flexShrink={0}>
          <Arc color={props.color} />
          <text> </text>
        </box>
      </Show>
      <box
        ref={setBody}
        flexGrow={1}
        flexShrink={1}
        onSizeChange={() => setColumns(body()?.width ?? 0)}
      >
        <text wrapMode={isOneLine() ? "none" : "word"}>
          <b style={{ fg: fg("label") }}>
            <Show when={props.words.isRunning === true} fallback={props.words.label}>
              <ShimmeringLabel color={props.color} text={props.words.label} dim={props.dim} />
            </Show>
          </b>
          <span style={{ fg: fg("subject") }}>{after(subject())}</span>
          <span style={{ fg: fg("detail") }}>{detail()}</span>
          <span style={{ fg: fg("failure") }}>{failure()}</span>
        </text>
      </box>
    </box>
  );
}
