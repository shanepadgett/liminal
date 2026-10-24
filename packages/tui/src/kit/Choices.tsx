/**
 * A short list of choices an ask offers, such as Approve and Reject: one `ChoiceRow` each, the
 * labels in one column. Up and down move the cursor, stopping at the ends; enter picks the choice
 * under it, its hint naming what that does. The keys act while focus is within `target`, so a field
 * opened under a choice, such as a note, keeps them. The ask holds which choice is under the
 * cursor.
 */

import type { Renderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { For } from "solid-js";

import { type Command, keymapCommand } from "../commands.ts";
import { ChoiceRow, labelColumnsOf } from "./ChoiceRow.tsx";

export interface Choice {
  readonly label: string;
  /** Enter's hint while the choice is under the cursor, such as `approve`. */
  readonly hint: string;
}

interface ChoicesProps {
  readonly choices: ReadonlyArray<Choice>;
  /** The index of the choice under the cursor. */
  readonly under: number;
  readonly onMove: (index: number) => void;
  readonly onPick: (index: number) => void;
  /** The ask's root; the keys act while focus is within it. */
  readonly target: () => Renderable | undefined;
}

const ENTER_KEYS = ["return", "kpenter"];

const pickName = (index: number) => `choices.pick.${index}`;

/** Moves by `by`, staying within the choices. */
const moveBy = (props: ChoicesProps, by: number) => {
  const next = Math.min(props.choices.length - 1, Math.max(0, props.under + by));
  if (next !== props.under) props.onMove(next);
};

const commandsOf = (props: ChoicesProps): Command[] => [
  {
    name: "choices.up",
    title: "Previous choice",
    hint: { label: "choose", keys: "↑↓" },
    enabled: () => props.choices.length > 1,
    run: () => {
      moveBy(props, -1);
    },
  },
  {
    name: "choices.down",
    title: "Next choice",
    enabled: () => props.choices.length > 1,
    run: () => {
      moveBy(props, 1);
    },
  },
  ...props.choices.map((choice, index): Command => ({
    name: pickName(index),
    title: choice.label,
    hint: { label: choice.hint },
    enabled: () => props.under === index,
    run: () => {
      props.onPick(index);
    },
  })),
];

const keysOf = (props: ChoicesProps) => [
  { key: "up", cmd: "choices.up" },
  { key: "down", cmd: "choices.down" },
  ...ENTER_KEYS.flatMap((key) => props.choices.map((_, index) => ({ key, cmd: pickName(index) }))),
];

export function Choices(props: ChoicesProps) {
  const columns = () => labelColumnsOf(props.choices.map((choice) => choice.label));

  useBindings(() => ({
    target: props.target,
    commands: commandsOf(props).map(keymapCommand),
    bindings: keysOf(props),
  }));

  return (
    <For each={props.choices}>
      {(choice, index) => (
        <ChoiceRow
          label={choice.label}
          labelColumns={columns()}
          isUnder={index() === props.under}
        />
      )}
    </For>
  );
}
