/** Cancel's server: `cancel/turn` interrupts the session's running turn through agent-loop. */

import { Effect } from "effect";

import { AgentLoop } from "@liminal/agent-loop/contract";

import { CancelRpcs } from "./contract.ts";

export const layer = CancelRpcs.toLayer(
  Effect.gen(function* () {
    const loop = yield* AgentLoop;

    return CancelRpcs.of({ "cancel/turn": ({ session }) => loop.cancel(session) });
  }),
);
