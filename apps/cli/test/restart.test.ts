/** The kernel starts the built-in plugins from their manifests, and entries survive a restart. */

import { expect } from "bun:test";

import { Context, Effect, Path, Predicate, Schema } from "effect";

import { start } from "@liminal/kernel";
import { defineEntry, draft, Seq, SessionId } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";

import { bootOptions } from "./support.ts";

const Note = defineEntry({
  kind: "test/note",
  data: Schema.Struct({ body: Schema.String }),
  model: false,
  user: "shown",
});

const s1 = SessionId.make("s1");

/** Starts a kernel over the repository's plugins folder in its own scope, as one run of Liminal. */
const run = <A, E>(use: (services: Context.Context<never>) => Effect.Effect<A, E>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;

      const kernel = yield* start(bootOptions(path));

      const active = (yield* kernel.status).flatMap((plugin) =>
        Predicate.isTagged(plugin, "Active") ? [plugin.name] : [],
      );

      expect(active.toSorted()).toEqual([
        "agent-loop",
        "cancel",
        "chat",
        "command-runner",
        "context",
        "credential-store",
        "inbox",
        "logins",
        "model-catalog",
        "model-codex",
        "model-openai",
        "models",
        "palette",
        "reload",
        "session-log",
        "session-store",
        "settings",
        "tool-pipeline",
        "tool-registry",
        "tools-file",
        "tools-shell",
      ]);

      return yield* kernel.use(use);
    }),
  );

effectTest(
  "an entry appended before a restart reads back after it",
  Effect.gen(function* () {
    yield* run((services) =>
      Effect.gen(function* () {
        yield* Context.getUnsafe(services, EntryKinds).register(Note);
        const log = Context.getUnsafe(services, SessionLog);
        yield* log.create(s1);
        yield* log.append(s1, [draft(Note, { data: { body: "a" }, text: "a" })]);
      }).pipe(Effect.scoped),
    );

    const read = yield* run((services) => Context.getUnsafe(services, SessionLog).read(s1, {}));

    expect(read.map((entry) => [entry.seq, entry.kind, entry.data])).toEqual([
      [Seq.make(1), "test/note", { body: "a" }],
    ]);
  }),
  testBaseServices,
);
