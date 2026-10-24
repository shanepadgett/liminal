/**
 * A short list of choices an ask offers, such as Approve and Reject: one `ChoiceRow` each, the
 * labels in one column. Up and down move the cursor, stopping at the ends; enter picks the choice
 * under it, its hint naming what that does.
 */

import { For } from "solid-js";

import { ChoiceRow, labelColumnsOf } from "./ChoiceRow.tsx";
import type { Hint } from "./Hints.tsx";

export interface Choice {
  readonly label: string;
  /** Enter's hint while the choice is under the cursor, such as `approve`. */
  readonly hint: string;
}

export function Choices(props: {
  readonly choices: readonly Choice[];
  /** The index of the choice under the cursor. */
  readonly under: number;
}) {
  const columns = () => labelColumnsOf(props.choices.map((choice) => choice.label));

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

/** The hints `Choices` adds: `↑↓ choose` with more than one, and enter's for the one under. */
export const choicesHintsOf = (choices: readonly Choice[], under: number): readonly Hint[] => [
  ...(choices.length > 1 ? [{ keys: "↑↓", label: "choose" }] : []),
  ...(choices[under] === undefined ? [] : [{ keys: "enter", label: choices[under].hint }]),
];
