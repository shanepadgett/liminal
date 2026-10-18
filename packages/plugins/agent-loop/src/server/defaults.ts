/**
 * A new turn's settings: read from the `agent-loop` settings section on each call, so a settings
 * edit applies to the next turn, and set by frontends in the global file.
 */

import { Effect, Stream, SubscriptionRef } from "effect";

import type { ModelRef, ThinkingLevel } from "@liminal/sdk";
import type { Settings } from "@liminal/settings/contract";

import {
  AgentLoopSection,
  DefaultSetFailed,
  DefaultsInvalid,
  DefaultsMissing,
  DefaultsSet,
  NoDefaultModel,
} from "../contract.ts";

export const makeDefaults = Effect.fn("makeDefaults")(function* (settings: Settings["Service"]) {
  // Counts sets; each change reads the section again.
  const sets = yield* SubscriptionRef.make(0);

  const defaults = Effect.gen(function* () {
    const { model, thinking } = yield* settings
      .section("agent-loop", AgentLoopSection)
      .pipe(Effect.mapError((error) => new DefaultsInvalid({ message: error.message })));

    if (model === undefined) return yield* new NoDefaultModel();

    return { model, thinking };
  });

  const view = defaults.pipe(
    Effect.match({
      onFailure: (error) => DefaultsMissing.make({ message: error.message }),
      onSuccess: (turn) => DefaultsSet.make({ settings: turn }),
    }),
  );

  const setDefault = Effect.fn("AgentLoop.setDefault")(
    function* (model: ModelRef, thinking?: ThinkingLevel) {
      yield* settings.write("global", ["agent-loop", "model"], model);

      if (thinking !== undefined)
        yield* settings.write("global", ["agent-loop", "thinking"], thinking);

      yield* SubscriptionRef.update(sets, (count) => count + 1);
    },
    Effect.mapError((error) => new DefaultSetFailed({ message: error.message })),
  );

  return {
    defaults,
    defaultsChanges: SubscriptionRef.changes(sets).pipe(Stream.mapEffect(() => view)),
    setDefault,
  };
});
