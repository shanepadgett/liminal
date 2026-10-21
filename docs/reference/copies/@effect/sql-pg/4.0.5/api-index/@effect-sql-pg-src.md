# @effect/sql-pg/src

- `PgAuth`: Password authentication for the PostgreSQL protocol: MD5 and SCRAM-SHA-256.
- `PgClient`: PostgreSQL support for Effect SQL, backed by the native wire protocol client.
- `PgConnection`: Native PostgreSQL sessions built on the `PgProtocol` wire codec.
- `PgMigrator`: Runs database migrations for PostgreSQL projects that use Effect SQL.
- `PgPool`: Pools of native `PgConnection` sessions.
- `PgProtocol`: Wire codec for the PostgreSQL frontend/backend protocol, version 3.0.
- `PgTypes`: Binary codecs for PostgreSQL values, keyed by type OID.
- `index`
