import type { State } from "../entries.ts";
import { Spinner } from "./Spinner.tsx";

export const spinnerStates: readonly [State, ...State[]] = [
  { name: "Thinking", fill: "center", view: () => <Spinner /> },
  { name: "With a label", fill: "center", view: () => <Spinner label="running bun test loop" /> },
];
