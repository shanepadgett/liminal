import type { State } from "../entries.ts";
import { type Pose, Porter } from "./Porter.tsx";

/** The faces questions gives him while an ask waits for the user. */
const WAITING_POSES: readonly Pose[] = [
  { face: "( •_• )", weight: 4, hold: [40, 90] },
  { face: "( -_- )", weight: 3, hold: [6, 10] },
  { face: "( -.- )", weight: 2, hold: [30, 70] },
  { face: "( •ᴗ• )", weight: 1, hold: [12, 24] },
];

export const porterStates: readonly [State, ...State[]] = [
  { name: "Thinking", fill: "center", view: () => <Porter /> },
  {
    name: "One word",
    fill: "center",
    view: () => <Porter words={["planning commits with claude-haiku-4.5"]} />,
  },
  {
    name: "Waiting for an ask",
    fill: "center",
    view: () => (
      <Porter words={["patiently waiting", "waiting for you", "all ears"]} poses={WAITING_POSES} />
    ),
  },
];
