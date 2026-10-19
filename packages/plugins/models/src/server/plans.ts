/**
 * Plan lists kept in `plans.json` in the data folder. A listing gets the kept list at once and the
 * plan is read again in the background; only a provider with no kept list waits for the read.
 */

import { Effect, FiberMap, FileSystem, Path, Record, Ref, Schema, Semaphore } from "effect";

import { Directories, type ModelError, type PlanModel } from "@liminal/sdk";

const KeptPlans = Schema.Record(
  Schema.String,
  Schema.Array(
    Schema.Struct({ id: Schema.String, contextWindow: Schema.OptionFromNullOr(Schema.Finite) }),
  ),
);

type KeptPlans = typeof KeptPlans.Type;

const KeptJson = Schema.fromJsonString(KeptPlans);

/** The kept lists in `filename`; a missing file keeps none, and so does one that does not decode. */
const readKept = Effect.fn("Models.readKept")(function* (
  fs: FileSystem.FileSystem,
  filename: string,
) {
  if (!(yield* fs.exists(filename))) return {};

  return yield* fs.readFileString(filename).pipe(
    Effect.flatMap(Schema.decodeEffect(KeptJson)),
    Effect.catch((error) =>
      Effect.logWarning(`The plan lists in ${filename} are unreadable`, error).pipe(Effect.as({})),
    ),
  );
});

/** Reads each provider's plan list through the kept copy. */
export const makePlans = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = (yield* Directories).data;
  const filename = path.join(folder, "plans.json");
  const kept = yield* Ref.make<KeptPlans>(yield* readKept(fs, filename));
  const saving = yield* Semaphore.make(1);
  const reading = yield* FiberMap.make<string>();

  /** Writes the kept lists; a failed save is logged, and the lists stay kept in memory. */
  const save = Effect.gen(function* () {
    yield* fs.makeDirectory(folder, { recursive: true });
    yield* fs.writeFileString(filename, yield* Schema.encodeEffect(KeptJson)(yield* Ref.get(kept)));
  }).pipe(
    saving.withPermits(1),
    Effect.catch((error) => Effect.logWarning(`Could not save ${filename}`, error)),
  );

  /** Reads `plan`, keeps it under `provider` and saves. */
  const readAndKeep = (
    provider: string,
    plan: Effect.Effect<ReadonlyArray<PlanModel>, ModelError>,
  ) =>
    Effect.tap(plan, (models) =>
      Ref.update(kept, Record.set(provider, models)).pipe(Effect.andThen(save)),
    );

  /** Forgets `provider`'s list, so a login that stopped working is not offered from the copy. */
  const forget = (provider: string) =>
    Ref.update(kept, Record.remove(provider)).pipe(Effect.andThen(save));

  /** Reads the plan again unless a read for `provider` already runs; an `auth` failure forgets it. */
  const refresh = (provider: string, plan: Effect.Effect<ReadonlyArray<PlanModel>, ModelError>) =>
    readAndKeep(provider, plan).pipe(
      Effect.catch((error) =>
        error.reason === "auth"
          ? forget(provider)
          : Effect.logWarning(`Reading ${provider}'s plan list failed`, error),
      ),
      FiberMap.run(reading, provider, { onlyIfMissing: true }),
    );

  /** The kept list for `provider`, not read again; with none kept, waits for the read. */
  const keptOf = Effect.fn("Models.keptOf")(function* (
    provider: string,
    plan: Effect.Effect<ReadonlyArray<PlanModel>, ModelError>,
  ) {
    const found = (yield* Ref.get(kept))[provider];

    return found ?? (yield* readAndKeep(provider, plan));
  });

  /** The kept list for `provider`, refreshed behind it; with none kept, waits for the read. */
  const planOf = Effect.fn("Models.planOf")(function* (
    provider: string,
    plan: Effect.Effect<ReadonlyArray<PlanModel>, ModelError>,
  ) {
    const found = (yield* Ref.get(kept))[provider];
    if (found === undefined) return yield* readAndKeep(provider, plan);

    yield* refresh(provider, plan);

    return found;
  });

  return { keptOf, planOf };
});
