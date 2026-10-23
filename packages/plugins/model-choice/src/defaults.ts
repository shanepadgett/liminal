/**
 * A session's model: its latest pick. A new session's: the `model-choice` default, else the newest
 * pick in any session, else whatever the rest of `SessionModel` says.
 */
import { Effect, Option } from "effect";

import type { Middleware } from "@shanepadgett/liminal-core";
import type { SessionModel } from "@shanepadgett/liminal-loop/contract";
import type { ModelChoice } from "@shanepadgett/liminal-model/contract";
import type { SessionEvent, SessionLog } from "@shanepadgett/liminal-session/contract";
import type { Settings } from "@shanepadgett/liminal-settings/contract";

import { ModelChoiceSetting, Picked } from "./contract.ts";

/** The pick `event` holds; none for another kind, or one its schema rejects, which is logged. */
const pickOf = (event: SessionEvent) =>
  Picked.decode(event).pipe(
    Effect.catchTag("EventInvalid", (error) =>
      Effect.as(Effect.logWarning(error.message), Option.none<ModelChoice>()),
    ),
  );

/** The latest pick in `events`. */
export const latestPick = (events: ReadonlyArray<SessionEvent>) => {
  const latest = events.findLast((event) => event.kind === Picked.kind);

  return latest === undefined ? Effect.succeed(Option.none<ModelChoice>()) : pickOf(latest);
};

type Chooser = Middleware<
  ReadonlyArray<SessionEvent>,
  ModelChoice,
  Effect.Error<ReturnType<SessionModel["Service"]["run"]>>
>;

/** The `SessionModel` wrap. */
export const makeChooser =
  (log: SessionLog["Service"], settings: Settings["Service"]): Chooser =>
  (events, next) =>
    Effect.gen(function* () {
      const own = yield* latestPick(events);
      if (Option.isSome(own)) return own.value;

      const saved = (yield* settings.get(ModelChoiceSetting)).default;
      if (saved !== undefined) return saved;

      const newest = yield* log.latest(Picked.kind);
      const picked = Option.isSome(newest) ? yield* pickOf(newest.value) : Option.none();
      if (Option.isSome(picked)) return picked.value;

      return yield* next(events);
    });
