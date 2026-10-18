/** CredentialStore: saved credentials, where a secret comes from, and one refresh across processes. */

import { expect } from "bun:test";

import {
  ConfigProvider,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Ref,
  Schema,
} from "effect";
import { TestClock } from "effect/testing";

import { Directories } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import credentialStore from "../plugin.ts";
import { ApiKey, CommandCredential, CredentialStore, OAuth } from "../src/contract.ts";
import { sqliteStore } from "../src/server/sqlite-store.ts";

const stack = serverOf(credentialStore).pipe(Layer.provideMerge(testBaseServices));

const oauth = (access: string, expiresAt: number): OAuth =>
  OAuth.make({
    access: Redacted.make(access),
    refresh: Redacted.make(`${access}-refresh`),
    expiresAt,
    extra: { accountId: "acc" },
  });

const reveal = Option.map(Redacted.value);

effectTest(
  "a credential saves, reads back with its secret hidden, and is removed; the file is private",
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    yield* store.set("codex", oauth("a1", 1000));

    const read = Option.getOrThrow(yield* store.get("codex"));
    expect(JSON.stringify(read)).not.toContain("a1");
    expect(Schema.is(OAuth)(read)).toBe(true);
    expect(read).toMatchObject({ expiresAt: 1000, extra: { accountId: "acc" } });
    expect(reveal(yield* store.secret("codex", {}))).toEqual(Option.some("a1"));

    yield* store.remove("codex");
    expect(yield* store.get("codex")).toEqual(Option.none());

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const info = yield* fs.stat(path.join((yield* Directories).data, "credentials.db"));
    expect(info.mode & 0o777).toBe(0o600);
  }),
  stack,
);

effectTest(
  "a secret comes from the store, then the environment; a command credential runs its command",
  Effect.gen(function* () {
    const store = yield* CredentialStore;

    expect(reveal(yield* store.secret("openai", {}))).toEqual(Option.none());

    expect(reveal(yield* store.secret("openai", { env: "LIMINAL_TEST_KEY" }))).toEqual(
      Option.some("from-env"),
    );

    yield* store.set("openai", ApiKey.make({ key: Redacted.make("stored") }));

    expect(reveal(yield* store.secret("openai", { env: "LIMINAL_TEST_KEY" }))).toEqual(
      Option.some("stored"),
    );

    yield* store.set("openai", CommandCredential.make({ command: "echo ' from-command '" }));
    expect(reveal(yield* store.secret("openai", {}))).toEqual(Option.some("from-command"));
  }).pipe(
    // The default provider reads the environment once per process, so set it here instead.
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ env: { LIMINAL_TEST_KEY: "from-env" } }),
    ),
  ),
  stack,
);

effectTest(
  "two processes needing a refresh at once refresh one time; a fresh token is not refreshed",
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const filename = path.join((yield* Directories).data, "credentials.db");
    const first = yield* Layer.build(sqliteStore(filename));
    const second = yield* Layer.build(sqliteStore(filename));
    const refreshes = yield* Ref.make(0);

    const refresh = (stale: OAuth) =>
      Effect.gen(function* () {
        yield* Ref.update(refreshes, (count) => count + 1);
        yield* Effect.promise(() => Bun.sleep(50));

        return oauth(`${Redacted.value(stale.access)}+`, Number.MAX_SAFE_INTEGER);
      });

    yield* Context.get(first, CredentialStore).set("codex", oauth("a1", 10_000));

    // The store waits for the other's lock on the real clock.
    const both = yield* TestClock.withLive(
      Effect.forEach(
        [first, second],
        (built) =>
          Context.get(built, CredentialStore).fresh("codex", refresh, Duration.seconds(30)),
        { concurrency: "unbounded" },
      ),
    );

    expect(both.map((credential) => Redacted.value(credential.access))).toEqual(["a1+", "a1+"]);
    expect(yield* Ref.get(refreshes)).toBe(1);

    const missing = yield* Effect.flip(
      Context.get(first, CredentialStore).fresh("other", refresh, Duration.seconds(30)),
    );

    expect(missing.message).toBe("no OAuth credential");
  }),
  stack,
);
