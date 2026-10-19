/**
 * One quiet row of work: a mark, the verb in bold, what it worked on, and fainter detail in
 * brackets; a failure shows in the danger color. Each part fades from its current color to a dimmed
 * one as the work is left behind.
 */

import type { BoxRenderable } from "@opentui/core";
import { createSignal } from "solid-js";

import { mixHex } from "./tokens/oklch.ts";
import type { RoleColor, RoleName } from "./tokens/roles.ts";
import { cutLine } from "./wrap.ts";

/** A work row's words. A one-line row cuts its subject to fit beside the verb and asides. */
export interface WorkWording {
  readonly verb: string;
  readonly subject: string;
  readonly detail: string;
  readonly failure: string;
  readonly oneLine?: boolean;
}

/** A part of a work row, or the text a row opens to. */
export type WorkPart = "mark" | "verb" | "subject" | "detail" | "failure" | "thought";

/** Each part's role while the work is current, and once it has dimmed. */
const PART_ROLES: Readonly<Record<WorkPart, readonly [RoleName, RoleName]>> = {
  mark: ["text.ghost", "text.ghost"],
  verb: ["text.muted", "text.ghost"],
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

const after = (text: string) => (text === "" ? "" : ` ${text}`);

const aside = (text: string) => (text === "" ? "" : ` (${text})`);

/** The mark stands in its own column, so wrapped words line up under the verb. */
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
    const { verb, subject: whole } = props.words;
    if (!isOneLine()) return whole;

    return cutLine(whole, columns() - verb.length - 1 - detail().length - failure().length);
  };

  return (
    <box flexDirection="row">
      <text fg={fg("mark")} flexShrink={0}>{`${props.mark} `}</text>
      <box
        ref={setBody}
        flexGrow={1}
        flexShrink={1}
        onSizeChange={() => setColumns(body()?.width ?? 0)}
      >
        <text wrapMode={isOneLine() ? "none" : "word"}>
          <b style={{ fg: fg("verb") }}>{props.words.verb}</b>
          <span style={{ fg: fg("subject") }}>{after(subject())}</span>
          <span style={{ fg: fg("detail") }}>{detail()}</span>
          <span style={{ fg: fg("failure") }}>{failure()}</span>
        </text>
      </box>
    </box>
  );
}
