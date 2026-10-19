/**
 * Checks' server: the entry kinds, the fix wrapper, the `checks` tool that follows the checks file,
 * and the hook that settles a turn's changes.
 */

import { Effect, Layer } from "effect";

import { BeforeCallHooks, TurnEndingHooks } from "@liminal/agent-loop/contract";
import { EntryKinds } from "@liminal/session-log/contract";
import { ToolWrappers } from "@liminal/tools/contract";

import { ChangesEntry, FixedEntry, ReportEntry } from "./contract.ts";
import { makeFixWrapper } from "./server/fix.ts";
import { makeSettle } from "./server/settle.ts";
import { makeChecksTool } from "./server/tool.ts";

/** Inside tool-output's spill, so a fixer's work happens before the outcome is fitted. */
const wrapperOrder = 10;

/** Before inbox's follow-ups, so failed checks go back to the model with them. */
const settleOrder = 50;

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const kinds = yield* EntryKinds;
    yield* kinds.register(ChangesEntry);
    yield* kinds.register(FixedEntry);
    yield* kinds.register(ReportEntry);

    yield* (yield* ToolWrappers).register(yield* makeFixWrapper, { order: wrapperOrder });

    const { followFile } = yield* makeChecksTool;
    yield* (yield* BeforeCallHooks).register(followFile, { order: 0 });

    yield* (yield* TurnEndingHooks).register(yield* makeSettle, { order: settleOrder });
  }),
);
