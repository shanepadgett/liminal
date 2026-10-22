import type { State } from "../entries.ts";
import { TerminalView } from "./TerminalView.tsx";

export const terminalStates: readonly [State, ...State[]] = [
  { name: "Reported", fill: "page", view: () => <TerminalView /> },
];
