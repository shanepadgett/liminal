/** The scripted provider's server: registers provider `scripted` and serves ScriptedModel. */

import { Effect, Layer, Ref, Stream } from "effect";

import { ModelProviders } from "@liminal/models/contract";
import type { ModelError, ModelEvent, ModelInfo, ModelRequest } from "@liminal/sdk";

import { type Script, type ScriptStep, ScriptedModel, scriptedProvider } from "./contract.ts";

const model: ModelInfo = {
  id: "scripted",
  name: "Scripted",
  contextWindow: 200_000,
  maxOutput: 32_000,
  thinking: ["off", "low", "medium", "high"],
  input: ["text", "image"],
};

interface Scripts {
  readonly queued: ReadonlyArray<Script>;
  readonly repeated: Script | undefined;
}

const play = (step: ScriptStep): Stream.Stream<ModelEvent, ModelError> => {
  if (step.type === "event") return Stream.succeed(step.event);
  if (step.type === "fail") return Stream.fail(step.error);
  if (step.type === "hang") return Stream.never;

  return Stream.drain(Stream.fromEffect(step.gate.await));
};

const make = Effect.gen(function* () {
  const providers = yield* ModelProviders;
  const scripts = yield* Ref.make<Scripts>({ queued: [], repeated: undefined });
  const requests = yield* Ref.make<ReadonlyArray<ModelRequest>>([]);

  /** The next script, taken off the queue, or the repeated one. */
  const next = Ref.modify(scripts, (current): readonly [Script | undefined, Scripts] => {
    const [first, ...rest] = current.queued;

    return first === undefined
      ? [current.repeated, current]
      : [first, { ...current, queued: rest }];
  });

  const stream = (request: ModelRequest) =>
    Stream.unwrap(
      Effect.gen(function* () {
        yield* Ref.update(requests, (all) => [...all, request]);
        const script = yield* next;
        if (script === undefined) return yield* Effect.die("no scripted response for this call");

        return Stream.fromIterable(script).pipe(Stream.flatMap(play));
      }),
    );

  yield* providers.register({
    id: scriptedProvider,
    name: "Scripted",
    models: Effect.succeed([model]),
    stream,
    nativeToolChanges: true,
  });

  return ScriptedModel.of({
    enqueue: (...added) =>
      Ref.update(scripts, (current) => ({ ...current, queued: [...current.queued, ...added] })),
    repeat: (script) => Ref.update(scripts, (current) => ({ ...current, repeated: script })),
    requests: Ref.get(requests),
  });
});

export const layer = Layer.effect(ScriptedModel, make);
