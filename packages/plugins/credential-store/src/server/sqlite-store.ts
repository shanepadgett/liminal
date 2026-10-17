/** CredentialStore over one SQLite file: one row per login method, the credential as JSON. */

import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import {
  Clock,
  Config,
  Duration,
  Effect,
  Layer,
  Option,
  Predicate,
  Redacted,
  Schedule,
  Schema,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { SqlClient, SqlError } from "effect/sql";

import { ApiKey, Credential, CredentialError, CredentialStore, OAuth } from "../contract.ts";

const createTable = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE credentials (method TEXT PRIMARY KEY, credential TEXT NOT NULL) WITHOUT ROWID
  `;
});

const migrate = SqliteMigrator.run({
  loader: SqliteMigrator.fromRecord({ "0001_create_credentials": createTable }),
});

const CredentialJson = Schema.fromJsonString(Schema.toCodecJson(Credential));
const encode = Schema.encodeEffect(CredentialJson);
const decode = Schema.decodeUnknownEffect(CredentialJson);

/**
 * Bun's SQLite waits for a busy database by blocking the thread, which would stall the holder when
 * it is a second build in this process; so the client never waits and this retries asynchronously.
 */
const whileBusy = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.retry(effect, {
    while: (error: E) =>
      SqlError.isSqlError(error) && Predicate.isTagged(error.reason, "LockTimeoutError"),
    schedule: Schedule.spaced("20 millis").pipe(Schedule.upTo({ duration: "30 seconds" })),
  });

const isApiKey = Schema.is(ApiKey);
const isOAuth = Schema.is(OAuth);

const failed = (method: string) => (error: { readonly message: string }) =>
  new CredentialError({ method, message: error.message });

/** Reads, saves and removes one method's row. */
const rows = (sql: SqlClient.SqlClient) => ({
  read: (method: string) =>
    Effect.gen(function* () {
      const [row] = yield* sql<{ readonly credential: string }>`
        SELECT credential FROM credentials WHERE method = ${method}
      `;

      if (row === undefined) return Option.none();

      return Option.some(yield* decode(row.credential));
    }).pipe(whileBusy, Effect.mapError(failed(method))),

  save: (method: string, credential: Credential) =>
    Effect.flatMap(
      encode(credential),
      (json) => sql`
        INSERT INTO credentials (method, credential) VALUES (${method}, ${json})
        ON CONFLICT (method) DO UPDATE SET credential = excluded.credential
      `,
    ).pipe(Effect.asVoid, whileBusy, Effect.mapError(failed(method))),

  remove: (method: string) =>
    sql`DELETE FROM credentials WHERE method = ${method}`.pipe(
      Effect.asVoid,
      whileBusy,
      Effect.mapError(failed(method)),
    ),
});

const fromEnv = (method: string, name: string | undefined) =>
  name === undefined
    ? Effect.succeedNone
    : Config.option(Config.Redacted(name)).pipe(Effect.mapError(failed(method)));

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* whileBusy(migrate);

  const { read, save, remove } = rows(sql);

  /** The secret a stored credential holds; a command credential runs its command. */
  const secretOf = (method: string, credential: Credential) => {
    if (isApiKey(credential)) return Effect.succeed(credential.key);
    if (isOAuth(credential)) return Effect.succeed(credential.access);

    return spawner.string(ChildProcess.make("/bin/sh", ["-c", credential.command])).pipe(
      Effect.map((output) => Redacted.make(output.trim())),
      Effect.mapError(failed(method)),
    );
  };

  const fresh = <E>(
    method: string,
    refresh: (stale: OAuth) => Effect.Effect<OAuth, E>,
    skew: Duration.Duration,
  ) =>
    Effect.gen(function* () {
      const stored = Option.filter(yield* read(method), isOAuth);

      if (Option.isNone(stored)) {
        return yield* new CredentialError({ method, message: "no OAuth credential" });
      }

      const now = yield* Clock.currentTimeMillis;
      if (stored.value.expiresAt - Duration.toMillis(skew) > now) return stored.value;

      const refreshed = yield* refresh(stored.value);
      yield* save(method, refreshed);

      return refreshed;
    }).pipe(
      sql.withTransaction,
      whileBusy,
      Effect.catchIf(SqlError.isSqlError, (error) => Effect.fail(failed(method)(error))),
    );

  return CredentialStore.of({
    get: read,
    set: save,
    remove,
    secret: (method, { env }) =>
      Effect.flatMap(
        read(method),
        Option.match({
          onNone: () => fromEnv(method, env),
          onSome: (credential) => Effect.asSome(secretOf(method, credential)),
        }),
      ),
    fresh,
  });
});

/** The store over the database at `filename`, migrated before first use. */
export const sqliteStore = (filename: string) =>
  Layer.effect(CredentialStore, make).pipe(
    Layer.provide(SqliteClient.layer({ filename, busyTimeout: 0 })),
  );
