/**
 * Usage: what each session's turn steps used and cost, over `usage/session`. It reads the session's
 * saved events once, then follows the new ones; `loop/step-start` names a step's model and a
 * finished `loop/step-end` adds its tokens, priced from the model's catalog details. The `tui`
 * entry adds the Usage section to chat's sidebar.
 */
import { Effect, Option, Stream } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { StepEnded, StepStarted } from "@shanepadgett/liminal-loop/contract";
import { type ModelDetails, type ModelId, Models } from "@shanepadgett/liminal-model/contract";
import {
  type LiveItem,
  type SessionEvent,
  type SessionId,
  SessionLog,
} from "@shanepadgett/liminal-session/contract";

import { UsageRpc } from "./contract.ts";
import { addStep, EMPTY, type Tally, tokensOf, usageOf } from "./count.ts";

const STEP_KINDS: ReadonlySet<string> = new Set([StepStarted.kind, StepEnded.kind]);

/** A saved step event, not a delta. */
const isStepEvent = (item: LiveItem): item is SessionEvent =>
  "seq" in item && STEP_KINDS.has(item.kind);

/**
 * A model's details as they are now, asked at each read so a refreshed window or price shows; none
 * when its provider is gone or unlisted.
 */
const makeDetails = (models: Models["Service"]) => (model: ModelId) =>
  models.details(model).pipe(Effect.orElseSucceed(() => Option.none<ModelDetails>()));

type Details = ReturnType<typeof makeDetails>;

/** `tally` after `event`: a start names the model, a finished end adds the step on it. */
const add = (details: Details) =>
  Effect.fn("Usage.add")(function* (tally: Tally, event: SessionEvent) {
    const started = StepStarted.decodeOption(event);
    if (Option.isSome(started)) return { ...tally, model: started.value.model };

    const ended = StepEnded.decodeOption(event);
    const { model } = tally;

    if (Option.isNone(ended) || ended.value.outcome !== "finished" || model === undefined)
      return tally;

    const price = Option.getOrUndefined(yield* details(model))?.price;

    return addStep(tally, model, tokensOf(ended.value.usage), price);
  });

/** What `tally` reads as, in the window of its latest finished step's model. */
const readOf = (details: Details) => (tally: Tally) => {
  const model = tally.latest?.model;
  if (model === undefined) return Effect.succeed(usageOf(tally));

  return Effect.map(details(model), (found) =>
    usageOf(tally, Option.getOrUndefined(found)?.contextWindow),
  );
};

/** The session's usage from its saved events, then again after each new step event. */
const watch = (log: SessionLog["Service"], models: Models["Service"], session: SessionId) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const details = makeDetails(models);
      const step = add(details);
      const saved = yield* log.read(session);
      let tally = EMPTY;
      for (const event of saved) if (STEP_KINDS.has(event.kind)) tally = yield* step(tally, event);

      return log.live(session, saved.at(-1)?.seq).pipe(
        Stream.filter(isStepEvent),
        Stream.scanEffect(() => tally, step),
        Stream.mapEffect(readOf(details)),
      );
    }),
  );

const rpc = UsageRpc.toLayer(
  Effect.gen(function* () {
    const log = yield* SessionLog;
    const models = yield* Models;

    return UsageRpc.of({ "usage/session": ({ session }) => watch(log, models, session) });
  }),
);

export default definePlugin({
  name: "usage",
  provides: [],
  requires: [SessionLog, Models],
  layer: rpc,
  entries: { tui: () => import("./tui/index.tsx") },
});
