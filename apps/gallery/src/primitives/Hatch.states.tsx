import type { State } from "../entries.ts";
import { Gradient } from "./Gradient.tsx";
import { Hatch } from "./Hatch.tsx";

export const hatchStates: readonly [State, ...State[]] = [
  {
    name: "Filling a row",
    fill: "page",
    view: () => (
      <box flexDirection="row" gap={1}>
        <Gradient text="liminal" bold />
        <Hatch />
      </box>
    ),
  },
  {
    name: "Scanning",
    fill: "page",
    view: () => (
      <box flexDirection="row" gap={1}>
        <Gradient text="l i m i n a l" />
        <Hatch isScanning />
      </box>
    ),
  },
  { name: "Gradient", fill: "center", view: () => <Hatch width={40} /> },
];
