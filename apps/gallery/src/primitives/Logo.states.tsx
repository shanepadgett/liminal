import type { State } from "../entries.ts";
import { Logo } from "./Logo.tsx";

export const logoStates: readonly [State, ...State[]] = [
  { name: "Wide", fill: "page", view: () => <Logo /> },
  {
    name: "Narrow",
    fill: "center",
    view: () => (
      <box width={40}>
        <Logo />
      </box>
    ),
  },
];
