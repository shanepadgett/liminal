/**
 * A new turn's settings: read from the `agent-loop` settings section on each call, so a settings
 * edit applies to the next turn, and set by frontends in the global file.
 */

import { Effect, Option, Stream, SubscriptionRef } from "effect";

import type { Models } from "@liminal/models/contract";
import { type ModelRef, thinkingOptionOf } from "@liminal/sdk";
import type { Settings } from "@liminal/settings/contract";

import {
  AgentLoopSection,
  DefaultSetFailed,
  DefaultsInvalid,
  DefaultsMissing,
  DefaultsSet,
  NoDefaultModel,
  type TurnSettings,
} from "../contract.ts";

export const makeDefaults = Effect.fn("makeDefaults")(function* (
  settings: Settings["Service"],
  models: Models["Service"],
) {
  // Counts sets; each change reads the section again.
  const sets = yield* SubscriptionRef.make(0);

  const defaults = Effect.gen(function* () {
    const { model, thinking } = yield* settings
      .section("agent-loop", AgentLoopSection)
      .pipe(Effect.mapError((error) => new DefaultsInvalid({ message: error.message })));

    if (model === undefined) return yield* new NoDefaultModel();

    return thinking === undefined ? { model } : { model, thinking };
  });

  /** The label of the option a turn with `turn` would use; none when the model is not found. */
  const thinkingLabel = (turn: TurnSettings) =>
    models.describe(turn.model).pipe(
      Effect.map((info) => Option.fromNullishOr(thinkingOptionOf(info, turn.thinking)?.label)),
      Effect.catch(() => Effect.succeedNone),
    );

  const view = defaults.pipe(
    Effect.flatMap((turn) =>
      Effect.map(thinkingLabel(turn), (label) =>
        Option.match(label, {
          onNone: () => DefaultsSet.make({ settings: turn }),
          onSome: (found) => DefaultsSet.make({ settings: turn, thinkingLabel: found }),
        }),
      ),
    ),
    Effect.catch((error) => Effect.succeed(DefaultsMissing.make({ message: error.message }))),
  );

  const setDefault = Effect.fn("AgentLoop.setDefault")(
    function* (model: ModelRef, thinking?: string) {
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
