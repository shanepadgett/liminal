import type { State } from "../../entries.ts";
import { useStream } from "../../primitives/Ink.tsx";
import { Reply } from "./Reply.tsx";
import { ANSWER } from "./samples.ts";

/** The sample answer streaming in, over and over. */
export function StreamingAnswer() {
  const head = useStream(ANSWER.length);

  return <Reply text={ANSWER} streamed={head()} />;
}

export const replyStates: readonly [State, ...State[]] = [
  { name: "Markdown", fill: "page", view: () => <Reply text={ANSWER} /> },
  { name: "Streaming", fill: "page", view: () => <StreamingAnswer /> },
];
