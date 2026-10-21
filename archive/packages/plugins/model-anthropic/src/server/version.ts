/**
 * The Claude Code version subscription requests name, read from npm as Tau does and kept in
 * `claude-code.json` in the data folder. A request uses the kept copy at once; only with none kept
 * does it wait for the read. A background check reads it again once a day.
 */

import {
  Clock,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Ref,
  Schedule,
  Schema,
  Semaphore,
} from "effect";
import { type HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { Directories, ModelError } from "@liminal/sdk";

const registryUrl = "https://registry.npmjs.org/@anthropic-ai/claude-code/latest";

/** How old the kept version may get before the background check reads it again. */
const keptFor = Duration.days(1);

/** How often the background check looks at the kept version's age; a failed read waits this long. */
const checkEvery = Duration.hours(1);

const KeptVersion = Schema.Struct({ version: Schema.String, checkedAt: Schema.Finite });

type KeptVersion = typeof KeptVersion.Type;

const KeptJson = Schema.fromJsonString(KeptVersion);

const Latest = Schema.Struct({ version: Schema.String });

/** The kept version in `filename`; a missing or unreadable file keeps none. */
const readKept = Effect.fn("ClaudeCode.readKept")(function* (
  fs: FileSystem.FileSystem,
  filename: string,
) {
  if (!(yield* fs.exists(filename))) return Option.none<KeptVersion>();

  return yield* fs.readFileString(filename).pipe(
    Effect.flatMap(Schema.decodeEffect(KeptJson)),
    Effect.asSome,
    Effect.catch((error) =>
      Effect.logWarning(`The Claude Code version in ${filename} is unreadable`, error).pipe(
        Effect.as(Option.none<KeptVersion>()),
      ),
    ),
  );
});

/** The latest Claude Code version npm lists. */
const readLatest = (http: HttpClient.HttpClient) =>
  http.execute(HttpClientRequest.get(registryUrl)).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Latest)),
    Effect.map((latest) => latest.version),
  );

export interface ClaudeCode {
  /** The kept version, or the one read now when none is kept. */
  readonly version: Effect.Effect<string, ModelError>;
}

/** Keeps the Claude Code version for the life of the layer's scope, checking it in the background. */
export const makeClaudeCode = Effect.fn("ClaudeCode.make")(function* (http: HttpClient.HttpClient) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = (yield* Directories).data;
  const filename = path.join(folder, "claude-code.json");
  const kept = yield* Ref.make(yield* readKept(fs, filename));
  const reading = yield* Semaphore.make(1);

  /** Reads the latest version, keeps it and saves it; a failed save is logged. */
  const readAndKeep = Effect.gen(function* () {
    const read: KeptVersion = {
      version: yield* readLatest(http),
      checkedAt: yield* Clock.currentTimeMillis,
    };

    yield* Ref.set(kept, Option.some(read));

    yield* fs.makeDirectory(folder, { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(filename, yield* Schema.encodeEffect(KeptJson)(read))),
      Effect.catch((error) => Effect.logWarning(`Could not save ${filename}`, error)),
    );

    return read.version;
  });

  /** Reads again when the kept version is older than a day, or none is kept. */
  const checkAge = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;

    const isDue = Option.match(yield* Ref.get(kept), {
      onNone: () => true,
      onSome: (copy) => now - copy.checkedAt >= Duration.toMillis(keptFor),
    });

    if (isDue) yield* readAndKeep;
  }).pipe(
    reading.withPermits(1),
    Effect.catch((error) => Effect.logWarning("Reading the Claude Code version failed", error)),
  );

  yield* Effect.forkScoped(Effect.repeat(checkAge, Schedule.spaced(checkEvery)));

  /** Under the same permit as the check, so a read already running is waited for, not repeated. */
  const keptOrRead = Effect.flatMap(Ref.get(kept), (copy) =>
    Option.match(copy, {
      onSome: (found) => Effect.succeed(found.version),
      onNone: () => readAndKeep,
    }),
  ).pipe(reading.withPermits(1));

  return {
    version: Effect.flatMap(Ref.get(kept), (copy) =>
      Option.match(copy, {
        onSome: (found) => Effect.succeed(found.version),
        onNone: () =>
          keptOrRead.pipe(
            Effect.mapError(
              (error) =>
                new ModelError({
                  reason: "network",
                  message: `Cannot read the Claude Code version from ${registryUrl}: ${error.message}`,
                }),
            ),
          ),
      }),
    ),
  } satisfies ClaudeCode;
});
