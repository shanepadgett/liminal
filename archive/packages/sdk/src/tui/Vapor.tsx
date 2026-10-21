/**
 * The assistant's thinking while it goes on: the last few lines of the thought in faint italic,
 * fading in from the background like reply text, each older line paler than the one under it, so
 * the thought seems to rise and thin out as it is written.
 */

import { type BoxRenderable, TextAttributes } from "@opentui/core";
import { createSignal, For, Index } from "solid-js";

import { inkRunsAt, wordEndAt } from "./ink.ts";
import { mixHex } from "./tokens/oklch.ts";
import type { RoleColor } from "./tokens/roles.ts";
import { wrapWords } from "./wrap.ts";

/** How strongly each line shows, newest last. */
const LINE_STRENGTHS = [0.3, 0.6, 1] as const;

/** A wrapped line of the thought, with how many of its characters are out. */
type Line = { readonly text: string; readonly shown: number };

/**
 * The thought's newest lines so far. Its words are one space apart, so each line starts one past
 * the end of the line before it.
 */
const linesOf = (text: string, head: number, columns: number): readonly Line[] => {
  const wrapped = wrapWords(text.slice(0, wordEndAt(text, head)), columns);
  const lines: Line[] = [];
  let start = 0;

  for (const line of wrapped) {
    lines.push({ text: line, shown: head - start });
    start += line.length + 1;
  }

  return lines.slice(-LINE_STRENGTHS.length);
};

/** `text` is the thought so far, its words one space apart; `head` is how far its ink is out. */
export function Vapor(props: {
  readonly color: RoleColor;
  readonly text: string;
  readonly head: number;
}) {
  const [body, setBody] = createSignal<BoxRenderable>();
  const [columns, setColumns] = createSignal(0);

  const lines = () => (columns() === 0 ? [] : linesOf(props.text, props.head, columns()));

  const inksAt = (index: number) => {
    const strength = LINE_STRENGTHS[LINE_STRENGTHS.length - lines().length + index] ?? 1;
    const ground = props.color("surface.base");
    const text = mixHex(ground, props.color("text.faint"), strength);

    return { text, code: text, ground };
  };

  return (
    <box ref={setBody} flexDirection="column" onSizeChange={() => setColumns(body()?.width ?? 0)}>
      <Index each={lines()}>
        {(line, index) => (
          <text wrapMode="none" attributes={TextAttributes.ITALIC}>
            <For each={inkRunsAt(line().text, line().shown, inksAt(index))}>
              {(run) => <span style={{ fg: run.fg }}>{run.text}</span>}
            </For>
          </text>
        )}
      </Index>
    </box>
  );
}
