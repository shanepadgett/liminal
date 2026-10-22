/** Credentials in the `accounts` table, one row per provider. */
import { Clock, Effect, Match, Option, Schema } from "effect";
import { Migrator, SqlClient, SqlError } from "effect/sql";

import { KeyCommands } from "./command.ts";
import { Credential, Credentials, CredentialsFailed, OAuth } from "./contract.ts";

/** Tokens are refreshed when they expire within this long. */
const refreshSkew = 60_000;

const CredentialText = Schema.fromJsonString(Schema.toCodecJson(Credential));

const Row = Schema.Struct({ credential: CredentialText });

const createTable = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE accounts (
      provider TEXT PRIMARY KEY,
      credential TEXT NOT NULL
    )
  `;
});

const migrate = Migrator.make({})({
  loader: Migrator.fromRecord({ "0001_create_table": createTable }),
  table: "accounts_migrations",
});

const failed = (provider: string) => (error: { readonly message: string }) =>
  new CredentialsFailed({ provider, message: `The credentials store failed: ${error.message}` });

export const makeStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const commands = yield* KeyCommands;
  yield* migrate;

  const get = (provider: string) =>
    sql`SELECT credential FROM accounts WHERE provider = ${provider}`.pipe(
      Effect.flatMap((rows) => Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(Row)(row))),
      Effect.map((rows) => Option.map(Option.fromNullishOr(rows[0]), (row) => row.credential)),
      Effect.mapError(failed(provider)),
    );

  const set = (provider: string, credential: Credential) =>
    Schema.encodeEffect(CredentialText)(credential).pipe(
      Effect.flatMap(
        (text) => sql`
          INSERT INTO accounts (provider, credential) VALUES (${provider}, ${text})
          ON CONFLICT (provider) DO UPDATE SET credential = excluded.credential
        `,
      ),
      Effect.asVoid,
      Effect.mapError(failed(provider)),
    );

  const remove = (provider: string) =>
    sql`DELETE FROM accounts WHERE provider = ${provider}`.pipe(
      Effect.asVoid,
      Effect.mapError(failed(provider)),
    );

  const key = (provider: string) =>
    Effect.flatMap(get(provider), (saved) => {
      if (Option.isNone(saved)) return Effect.succeedNone;

      return Match.valueTags(saved.value, {
        ApiKey: (apiKey) => Effect.succeedSome(apiKey.key),
        Command: ({ command }) =>
          commands(command).pipe(
            Effect.asSome,
            Effect.mapError((error) => new CredentialsFailed({ provider, message: error.message })),
          ),
        OAuth: () => Effect.succeedNone,
      });
    });

  const fresh = <E>(provider: string, refresh: (stale: OAuth) => Effect.Effect<OAuth, E>) =>
    Effect.gen(function* () {
      const saved = Option.filter(yield* get(provider), Schema.is(OAuth));

      if (Option.isNone(saved)) {
        return yield* new CredentialsFailed({
          provider,
          message: `No ${provider} login is saved.`,
        });
      }

      if (saved.value.expiresAt - refreshSkew > (yield* Clock.currentTimeMillis)) {
        return saved.value;
      }

      const refreshed = yield* refresh(saved.value);
      yield* set(provider, refreshed);

      return refreshed;
    }).pipe(
      sql.withTransaction,
      Effect.catchIf(SqlError.isSqlError, (error) => Effect.fail(failed(provider)(error))),
    );

  return Credentials.of({ get, set, remove, key, fresh });
});
