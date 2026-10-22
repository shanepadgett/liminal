import type { State } from "../../entries.ts";
import { Landing } from "./Landing.tsx";

export const landingStates: readonly [State, ...State[]] = [
  { name: "Empty session", fill: "page", view: () => <Landing version="v0.1.0" /> },
];
