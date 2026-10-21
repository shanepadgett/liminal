/** Session name's server: the `name_session` tool and the check that allows it once. */

import { Effect, Layer } from "effect";

import { BeforeCallHooks } from "@liminal/agent-loop/contract";
import { SessionLog } from "@liminal/session-log/contract";
import { ToolChecks, Tools } from "@liminal/tools/contract";

import { beforeCallOf } from "./server/before-call.ts";
import { onceCheck } from "./server/once.ts";
import { nameToolOf } from "./server/tool.ts";

/** Before approval, so a repeat call is refused without asking. */
const checkOrder = 50;

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const log = yield* SessionLog;

    yield* (yield* BeforeCallHooks).register(beforeCallOf(log), { order: 100 });
    yield* (yield* Tools).register(nameToolOf(log));
    yield* (yield* ToolChecks).register(onceCheck(log), { order: checkOrder });
  }),
);
