import type { State } from "../../entries.ts";
import { Reply } from "./Reply.tsx";
import { ANSWER, QUESTION, READ, READING } from "./samples.ts";
import { Prompt, Turn } from "./Turn.tsx";
import { TurnEnd } from "./TurnEnd.tsx";
import { type WorkRow, WorkRows } from "./WorkRows.tsx";

const MODEL = "claude-sonnet-4.5";

/** The reads a stop cut short: the one still running fails with the turn. */
const CUT_READS: readonly WorkRow[] = [
  ...READING.slice(0, -1),
  { tool: "read", input: "packages/plugins/loop/src/turn.ts", status: "failed" },
];

export const turnEndStates: readonly [State, ...State[]] = [
  {
    name: "Kinds",
    fill: "page",
    view: () => (
      <box>
        <TurnEnd ending="finished" model={MODEL} time="38s" />
        <TurnEnd ending="stopped" model={MODEL} time="14s" />
        <TurnEnd ending="interrupted" model={MODEL} />
      </box>
    ),
  },
  {
    name: "In turns",
    fill: "page",
    view: () => (
      <box>
        <Turn input={QUESTION}>
          <WorkRows rows={READ} />
          <Reply text={ANSWER} />
          <TurnEnd ending="finished" model={MODEL} time="2m 05s" />
        </Turn>
        <Turn input="Where else does it retry?">
          <WorkRows rows={CUT_READS} />
          <Reply text={ANSWER} streamed={190} />
          <TurnEnd ending="stopped" model={MODEL} time="14s" />
        </Turn>
        <Prompt input="Skip the tests and just show me the retry path." />
      </box>
    ),
  },
];
