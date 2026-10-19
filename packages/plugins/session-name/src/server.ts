/** Session name's server: the `name_session` tool and the check that allows it once. */

import { Effect, Layer } from "effect";

import { SessionLog } from "@liminal/session-log/contract";
import { ToolChecks, Tools } from "@liminal/tools/contract";

import { onceCheck } from "./server/once.ts";
import { nameToolOf } from "./server/tool.ts";

/** Before approval, so a repeat call is refused without asking. */
const checkOrder = 50;

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const log = yield* SessionLog;

    yield* (yield* Tools).register(nameToolOf(log));
    yield* (yield* ToolChecks).register(onceCheck(log), { order: checkOrder });
  }),
);
