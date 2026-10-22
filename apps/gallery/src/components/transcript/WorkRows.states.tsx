import type { State } from "../../entries.ts";
import { useStream } from "../../primitives/Ink.tsx";
import { EDITING, READ, READING, SCRIPT } from "./samples.ts";
import { WorkRows } from "./WorkRows.tsx";

/** A script being written as a call, over and over, under the reads before it. */
export function StreamingCall() {
  const head = useStream(SCRIPT.length);

  return (
    <WorkRows
      rows={[...READ, { tool: "shell", input: SCRIPT, status: "running", streamed: head() }]}
    />
  );
}

export const workRowsStates: readonly [State, ...State[]] = [
  { name: "Reading", fill: "page", view: () => <WorkRows rows={READING} /> },
  { name: "Edit and failed command", fill: "page", view: () => <WorkRows rows={EDITING} /> },
  { name: "Streaming a call", fill: "page", view: () => <StreamingCall /> },
  {
    name: "Script opened",
    fill: "page",
    view: () => (
      <WorkRows
        rows={[
          ...EDITING,
          { tool: "shell", input: SCRIPT, status: "done", note: "exit 0", isOpen: true },
        ]}
      />
    ),
  },
];
