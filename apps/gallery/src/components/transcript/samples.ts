/** Sample turns the transcript states and the chat screen share. */

import type { WorkRow } from "./WorkRows.tsx";

export const QUESTION = "Why does the loop retry twice when the provider is overloaded?";

export const ANSWER = [
  "The retry runs in **two places**: `recovery.ts` retries the request, and `turn.ts` retries the step when the request fails.",
  "",
  "Keep the one in `recovery.ts`, since it knows the provider's `retry-after`:",
  "",
  "```ts",
  'const schedule = Schedule.exponential("1 second").pipe(Schedule.take(3));',
  "```",
  "",
  "| Place | Retries | Reads retry-after |",
  "| --- | --- | --- |",
  "| recovery.ts | 3 | yes |",
  "| turn.ts | 1 | no |",
].join("\n");

export const STREAMING =
  "The retry runs in **two places**: `recovery.ts` retries the request, and `turn.ts` retri";

const EDIT = [
  "--- a/packages/plugins/loop/src/turn.ts",
  "+++ b/packages/plugins/loop/src/turn.ts",
  "@@ -12,4 +12,4 @@",
  ' const step = Effect.fn("step")(function* (input: Input) {',
  "   const reply = yield* model.call(input);",
  "-  return yield* reply.pipe(Effect.retry({ times: 1 }));",
  "+  return yield* reply;",
  " });",
].join("\n");

export const READING: readonly WorkRow[] = [
  {
    tool: "read",
    target: "packages/plugins/loop/src/recovery.ts",
    status: "done",
    note: "84 lines",
  },
  { tool: "grep", target: "retry", status: "done", note: "6 matches" },
  { tool: "read", target: "packages/plugins/loop/src/turn.ts", status: "running" },
];

export const EDITING: readonly WorkRow[] = [
  {
    tool: "edit",
    target: "packages/plugins/loop/src/turn.ts",
    status: "done",
    note: "+1 -1",
    diff: EDIT,
  },
  { tool: "bash", target: "bun test loop", status: "failed", note: "exit 1" },
];
