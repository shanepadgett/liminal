import type { State } from "../../entries.ts";
import { Header } from "./Header.tsx";

export const headerStates: readonly [State, ...State[]] = [
  { name: "Session", fill: "screen", view: () => <Header title="Sorting out the plugin host" /> },
  { name: "New session", fill: "screen", view: () => <Header title={undefined} /> },
];
