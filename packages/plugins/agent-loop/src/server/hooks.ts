/** Running the before-call and turn-ending checkpoints. */

import { Effect } from "effect";

import type { EntryDraft } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";

import {
  BeforeCall,
  type BeforeCallHooks,
  StepOutcome,
  type Turn,
  type TurnEndingHooks,
} from "../contract.ts";
import { saveDrafts } from "./calls.ts";

export const makeHooks = (
  log: SessionLog["Service"],
  beforeCall: BeforeCallHooks["Service"],
  turnEnding: TurnEndingHooks["Service"],
) => {
  /** The before-call hooks in order: the first `EndTurn` ends the turn; inputs are saved. */
  const runBeforeCall = Effect.fn("AgentLoop.beforeCall")(function* (turn: Turn) {
    const input: Array<EntryDraft> = [];

    for (const hook of yield* beforeCall.list) {
      const decision = yield* hook(turn);

      if (BeforeCall.$is("EndTurn")(decision))
        return StepOutcome.EndedByPlugin({ reason: decision.reason });

      input.push(...decision.input);
    }

    yield* saveDrafts(log, turn.sessionId, input);

    return StepOutcome.Continue();
  });

  /** The turn-ending hooks' follow-ups, saved; any follow-up continues the turn. */
  const runTurnEnding = Effect.fn("AgentLoop.turnEnding")(function* (turn: Turn) {
    const followUps: Array<EntryDraft> = [];
    for (const hook of yield* turnEnding.list) followUps.push(...(yield* hook(turn)));

    yield* saveDrafts(log, turn.sessionId, followUps);

    return followUps.length > 0 ? StepOutcome.Continue() : StepOutcome.Answered();
  });

  return { runBeforeCall, runTurnEnding };
};
