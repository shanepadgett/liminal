import type { State } from "../../entries.ts";
import { Reply } from "./Reply.tsx";
import { ANSWER, STREAMING } from "./samples.ts";

export const replyStates: readonly [State, ...State[]] = [
  { name: "Markdown", fill: "page", view: () => <Reply text={ANSWER} isStreaming={false} /> },
  { name: "Streaming", fill: "page", view: () => <Reply text={STREAMING} isStreaming /> },
];
