import type { State } from "../../entries.ts";
import { Header } from "./Header.tsx";

const MODEL = "claude-sonnet-4.5";

export const headerStates: readonly [State, ...State[]] = [
  {
    name: "Idle",
    fill: "screen",
    view: () => <Header title="Sorting out the plugin host" model={MODEL} isWorking={false} />,
  },
  {
    name: "Working",
    fill: "screen",
    view: () => <Header title="Sorting out the plugin host" model={MODEL} isWorking />,
  },
  {
    name: "New session",
    fill: "screen",
    view: () => <Header title={undefined} model={MODEL} isWorking={false} />,
  },
];
