import type { State } from "../../entries.ts";
import { Checkpoint } from "./Checkpoint.tsx";

export const checkpointStates: readonly [State, ...State[]] = [
  { name: "Files read", fill: "page", view: () => <Checkpoint filesRead={6} /> },
  { name: "One file read", fill: "page", view: () => <Checkpoint filesRead={1} /> },
  { name: "After the cache was lost", fill: "page", view: () => <Checkpoint filesRead={0} /> },
];
