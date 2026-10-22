/** Builds each model call's messages from the log through each event kind's converter. */
import { Effect, Layer } from "effect";

import { definePlugin, Pipeline, Registry } from "@shanepadgett/liminal-core";
import type { Message } from "@shanepadgett/liminal-model/contract";
import { MessageEvent, type SessionEvent } from "@shanepadgett/liminal-session/contract";

import { type Converter, Converters, defineConverter, History } from "./contract.ts";

const convertAll = (converters: ReadonlyArray<Converter>, events: ReadonlyArray<SessionEvent>) => {
  const byKind = new Map(converters.map((converter) => [converter.kind, converter]));

  return Effect.map(
    Effect.forEach(events, (event) => byKind.get(event.kind)?.convert(event) ?? Effect.succeed([])),
    (messages): ReadonlyArray<Message> => messages.flat(),
  );
};

const history = Layer.effect(
  History,
  Effect.gen(function* () {
    const converters = yield* Converters;
    yield* converters.add(defineConverter(MessageEvent, (message) => [message]));

    return yield* Pipeline.make((events: ReadonlyArray<SessionEvent>) =>
      Effect.flatMap(converters.list, (current) => convertAll(current, events)),
    );
  }),
);

export default definePlugin({
  name: "history",
  provides: [Converters, History],
  requires: [],
  layer: history.pipe(Layer.provideMerge(Layer.effect(Converters, Registry.make<Converter>()))),
});
