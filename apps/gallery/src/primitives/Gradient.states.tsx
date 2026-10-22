import type { State } from "../entries.ts";
import { Gradient } from "./Gradient.tsx";

export const gradientStates: readonly [State, ...State[]] = [
  { name: "Wordmark", fill: "center", view: () => <Gradient text="liminal" bold /> },
  {
    name: "Long",
    fill: "center",
    view: () => <Gradient text="Every part that feeds the model is a plugin" />,
  },
];
