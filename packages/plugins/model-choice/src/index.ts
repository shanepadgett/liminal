/**
 * Model choice: wraps `loop`'s `SessionModel`, so each session runs its latest pick and a new one
 * the user's default, and `loop`'s `Send`, so an input's pick, or the session's model on its first
 * input, is logged as a `Picked` event before it. The `tui` entry adds `/model`, `shift+tab` and
 * the model line.
 */
import { Effect, Layer, Option } from "effect";

import { Attribute, type Attributes, definePlugin } from "@shanepadgett/liminal-core";
import { type Input, Send, SessionModel } from "@shanepadgett/liminal-loop/contract";
import { EventInvalid, type SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";
import { DeclaredSettings, Settings } from "@shanepadgett/liminal-settings/contract";

import { ModelChoiceRpc, ModelChoiceSetting, ModelPick, Picked, sameChoice } from "./contract.ts";
import { latestPick, makeChooser } from "./defaults.ts";

const withoutPick = (attributes: Attributes): Attributes =>
  Object.fromEntries(Object.entries(attributes).filter(([key]) => key !== ModelPick.key));

/** The input's pick; one its schema rejects fails the send, as any invalid event does. */
const pickOn = (input: Input) =>
  Attribute.get(input.attributes, ModelPick).pipe(
    Effect.mapError((error) => new EventInvalid({ kind: input.kind, message: error.message })),
  );

/**
 * Logs the input's pick, or the session's model on its first input, when it changes what the
 * session runs. With no model to fall back on it logs nothing, and the turn says why.
 */
const makeLogPick = (log: SessionLog["Service"], sessionModel: SessionModel["Service"]) =>
  Effect.fn("ModelChoice.logPick")(function* (session: SessionId, input: Input) {
    const pick = yield* pickOn(input);
    const events = yield* log.read(session);
    const current = yield* latestPick(events);

    const chosen =
      Option.isSome(pick) || Option.isSome(current)
        ? pick
        : yield* Effect.option(sessionModel.run(events));

    if (Option.isNone(chosen)) return;
    if (Option.isSome(current) && sameChoice(current.value, chosen.value)) return;

    yield* log.append(session, [yield* Picked.make(chosen.value, withoutPick(input.attributes))]);
  });

const wraps = Layer.effectDiscard(
  Effect.gen(function* () {
    const log = yield* SessionLog;
    const sessionModel = yield* SessionModel;
    yield* (yield* DeclaredSettings).add(ModelChoiceSetting);
    yield* sessionModel.wrap(makeChooser(log, yield* Settings));

    const logPick = makeLogPick(log, sessionModel);

    yield* (yield* Send).wrap((request, next) =>
      Effect.andThen(logPick(request.session, request.input), () => {
        const attributes = withoutPick(request.input.attributes);

        return next({ ...request, input: { ...request.input, attributes } });
      }),
    );
  }),
);

const rpc = ModelChoiceRpc.toLayer(
  Effect.gen(function* () {
    const log = yield* SessionLog;
    const settings = yield* Settings;
    const sessionModel = yield* SessionModel;

    return ModelChoiceRpc.of({
      "model-choice/session": ({ session }) =>
        session === undefined
          ? sessionModel.run([])
          : Effect.flatMap(log.read(session), sessionModel.run),
      "model-choice/default": () =>
        Effect.map(settings.get(ModelChoiceSetting), (setting) => setting.default),
      "model-choice/set-default": ({ choice }) =>
        settings.write("global", [ModelChoiceSetting.key, "default"], choice),
    });
  }),
);

export default definePlugin({
  name: "model-choice",
  provides: [],
  requires: [Send, SessionModel, SessionLog, Settings, DeclaredSettings],
  layer: Layer.mergeAll(wraps, rpc),
  entries: { tui: () => import("./tui/index.tsx") },
});
