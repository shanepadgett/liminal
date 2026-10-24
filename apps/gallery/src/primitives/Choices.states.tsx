import type { State } from "../entries.ts";
import { type Choice, Choices, choicesHintsOf } from "./Choices.tsx";
import { Hints } from "./Hints.tsx";

const APPROVAL: readonly Choice[] = [
  { label: "Approve", hint: "approve" },
  { label: "Reject", hint: "reject" },
];

const PUSH: readonly Choice[] = [
  { label: "No, keep them local", hint: "keep local" },
  { label: "Yes, push", hint: "push" },
];

const list = (choices: readonly Choice[], under: number) => () => (
  <box width={60} gap={1}>
    <box>
      <Choices choices={choices} under={under} />
    </box>
    <Hints hints={choicesHintsOf(choices, under)} />
  </box>
);

export const choicesStates: readonly [State, ...State[]] = [
  { name: "First under", fill: "center", view: list(APPROVAL, 0) },
  { name: "Last under", fill: "center", view: list(APPROVAL, 1) },
  { name: "Long labels", fill: "center", view: list(PUSH, 1) },
];
