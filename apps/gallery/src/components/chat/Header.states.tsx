import type { State } from "../../entries.ts";
import { Header } from "./Header.tsx";

const TITLE = "Sorting out the plugin host";

export const headerStates: readonly [State, ...State[]] = [
  { name: "Session", fill: "screen", view: () => <Header title={TITLE} isWorking={false} /> },
  { name: "Working", fill: "screen", view: () => <Header title={TITLE} isWorking /> },
  {
    name: "New session",
    fill: "screen",
    view: () => <Header title={undefined} isWorking={false} />,
  },
];
