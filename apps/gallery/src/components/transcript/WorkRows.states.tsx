import type { State } from "../../entries.ts";
import { useStream } from "../../primitives/Ink.tsx";
import {
  EDIT,
  EDITING,
  READ,
  READING,
  SCRIPT,
  SCRIPT_RUN,
  TESTING,
  TESTS,
} from "./work-samples.tsx";
import { WorkRows } from "./WorkRows.tsx";

/** A command being written as a call, over and over, under the reads before it. */
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
    name: "Command running",
    fill: "page",
    view: () => <WorkRows rows={[...READ, EDIT, TESTING]} />,
  },
  {
    name: "Edit opened",
    fill: "page",
    view: () => <WorkRows rows={[...READ, { ...EDIT, isOpen: true }, TESTS]} />,
  },
  {
    name: "Command opened",
    fill: "page",
    view: () => <WorkRows rows={[...EDITING, { ...SCRIPT_RUN, isOpen: true }]} />,
  },
];
