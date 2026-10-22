import type { State } from "../entries.ts";
import { Rule } from "./Rule.tsx";

export const ruleStates: readonly [State, ...State[]] = [
  { name: "Plain", fill: "page", view: () => <Rule /> },
  { name: "Labeled", fill: "page", view: () => <Rule label="Earlier today" /> },
];
