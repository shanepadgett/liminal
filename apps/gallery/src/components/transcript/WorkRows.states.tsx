import type { State } from "../../entries.ts";
import { EDITING, READING } from "./samples.ts";
import { WorkRows } from "./WorkRows.tsx";

export const workRowsStates: readonly [State, ...State[]] = [
  { name: "Reading", fill: "page", view: () => <WorkRows rows={READING} /> },
  { name: "Edit and failed command", fill: "page", view: () => <WorkRows rows={EDITING} /> },
];
