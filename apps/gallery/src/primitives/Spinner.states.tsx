import type { State } from "../entries.ts";
import { Spinner } from "./Spinner.tsx";

export const spinnerStates: readonly [State, ...State[]] = [
  { name: "Thinking", fill: "center", view: () => <Spinner label="Thinking" /> },
  { name: "Working", fill: "center", view: () => <Spinner label="Running bun test loop" /> },
];
