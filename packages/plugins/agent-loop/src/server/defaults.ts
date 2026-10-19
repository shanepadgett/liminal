/**
 * Turn settings: a new session's come from the `agent-loop` settings section, read on each call so
 * a settings edit applies to the next turn. A session's come from the pick no turn has used yet,
 * else its newest turn. A pick also sets the default in the global file.
 */

import { Effect, Option, Schema, Stream, SubscriptionRef } from "effect";

import type { Models } from "@liminal/models/contract";
import { type ModelInfo, type ModelRef, type SessionId, thinkingOptionOf } from "@liminal/sdk";
import { type SessionLog, TurnSettings, TurnStartedEntry } from "@liminal/session-log/contract";
import type { Settings } from "@liminal/settings/contract";

import {
  AgentLoopSection,
  Cycled,
  type CycleResult,
  DefaultSetFailed,
  DefaultsInvalid,
  DefaultsMissing,
  DefaultsSet,
  NoDefaultModel,
  NoOptions,
} from "../contract.ts";

const decodeSettings = Schema.decodeUnknownOption(TurnSettings);

/** A new session's settings, from the `agent-loop` section. */
const readDefaults = (settings: Settings["Service"]) =>
  Effect.gen(function* () {
    const { model, thinking } = yield* settings
      .section("agent-loop", AgentLoopSection)
      .pipe(Effect.mapError((error) => new DefaultsInvalid({ message: error.message })));

    if (model === undefined) return yield* new NoDefaultModel();

    return thinking === undefined ? { model } : { model, thinking };
  });

/** The settings of the session's newest turn, if it has one. */
const lastTurn = (log: SessionLog["Service"], session: SessionId) =>
  Effect.map(log.lastOfKinds([TurnStartedEntry]), (entries) =>
    Option.flatMap(
      Option.fromNullishOr(entries.find((entry) => entry.sessionId === session)),
      (entry) => decodeSettings(entry.data),
    ),
  );

/** The label of the option a turn with `turn` would use; none when the model is not found. */
const thinkingLabel = (models: Models["Service"], turn: TurnSettings) =>
  models.describe(turn.model).pipe(
    Effect.map((info) => Option.fromNullishOr(thinkingOptionOf(info, turn.thinking)?.label)),
    Effect.catch(() => Effect.succeedNone),
  );

/**
 * The option after the one `current` names, wrapping around; a `current` the model does not offer
 * counts as its default. None when the model offers fewer than two options.
 */
export const nextThinking = (info: ModelInfo, current?: string) => {
  if (info.thinking.length < 2) return Option.none();

  const at = info.thinking.findIndex((option) => option.id === thinkingOptionOf(info, current)?.id);

  return Option.fromNullishOr(info.thinking[(at + 1) % info.thinking.length]);
};

/** The settings as frontends show them, or why there are none. */
const viewOf = <E extends { readonly message: string }>(
  models: Models["Service"],
  settings: Effect.Effect<TurnSettings, E>,
) =>
  settings.pipe(
    Effect.flatMap((turn) =>
      Effect.map(thinkingLabel(models, turn), (label) =>
        Option.match(label, {
          onNone: () => DefaultsSet.make({ settings: turn }),
          onSome: (found) => DefaultsSet.make({ settings: turn, thinkingLabel: found }),
        }),
      ),
    ),
    Effect.catch((error) => Effect.succeed(DefaultsMissing.make({ message: error.message }))),
  );

/** What the defaults read from. */
interface DefaultsDeps {
  readonly settings: Settings["Service"];
  readonly models: Models["Service"];
  readonly log: SessionLog["Service"];
}

export const makeDefaults = Effect.fn("makeDefaults")(function* ({
  settings,
  models,
  log,
}: DefaultsDeps) {
  // Counts picks and turn starts; each change reads a session's settings again.
  const changes = yield* SubscriptionRef.make(0);
  const picks = new Map<SessionId, TurnSettings>();
  const changed = SubscriptionRef.update(changes, (count) => count + 1);

  const defaults = readDefaults(settings);

  const sessionSettings = Effect.fn("AgentLoop.sessionSettings")(function* (session: SessionId) {
    const picked = picks.get(session);
    if (picked !== undefined) return picked;

    const last = yield* lastTurn(log, session);

    return Option.isSome(last) ? last.value : yield* defaults;
  });

  const pick = Effect.fn("AgentLoop.pick")(
    function* (session: SessionId, model: ModelRef, thinking?: string) {
      yield* settings.write("global", ["agent-loop", "model"], model);

      if (thinking !== undefined)
        yield* settings.write("global", ["agent-loop", "thinking"], thinking);

      picks.set(session, thinking === undefined ? { model } : { model, thinking });
      yield* changed;
    },
    Effect.mapError((error) => new DefaultSetFailed({ message: error.message })),
  );

  const cycleThinking = Effect.fn("AgentLoop.cycleThinking")(
    function* (session: SessionId) {
      const turn = yield* sessionSettings(session);
      const info = yield* models.describe(turn.model);
      const next = nextThinking(info, turn.thinking);

      if (Option.isNone(next)) return NoOptions.make({}) satisfies CycleResult;

      yield* pick(session, turn.model, next.value.id);

      return Cycled.make({ label: next.value.label }) satisfies CycleResult;
    },
    Effect.mapError((error) => new DefaultSetFailed({ message: error.message })),
  );

  /** A turn started in the session, so it has used any pick. */
  const started = (session: SessionId) =>
    Effect.suspend(() => {
      picks.delete(session);

      return changed;
    });

  return {
    defaults,
    sessionSettings,
    sessionDefaults: (session: SessionId) =>
      SubscriptionRef.changes(changes).pipe(
        Stream.mapEffect(() => viewOf(models, sessionSettings(session))),
      ),
    pick,
    cycleThinking,
    started,
  };
});
