import type { State } from "../entries.ts";
import { Diff } from "./Diff.tsx";

const PATH = "packages/plugins/loop/src/recovery.ts";

const PATCH = [
  `--- ${PATH}`,
  `+++ ${PATH}`,
  "@@ -12,7 +12,8 @@",
  " export const retrying = <A, E, R>(request: Effect.Effect<A, E, R>) =>",
  "   request.pipe(",
  "     Effect.retry({",
  '-      schedule: Schedule.exponential("1 second").pipe(Schedule.take(3)),',
  '+      schedule: Schedule.exponential("1 second").pipe(Schedule.take(4)),',
  "+      while: isOverloaded,",
  "     }),",
  "   );",
  " ",
].join("\n");

export const diffStates: readonly [State, ...State[]] = [
  { name: "Unified", fill: "page", view: () => <Diff path={PATH} patch={PATCH} /> },
];
