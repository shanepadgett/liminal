/** The host boots the built-in plugins from their manifests, and entries survive a restart. */

import { expect } from "bun:test";

import { Context, Effect, Path, Predicate, Schema } from "effect";

import { boot } from "@liminal/kernel";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";
import { defineEntry, EntryKinds, Seq, SessionId, SessionLog } from "@liminal/session-log/contract";

const Note = defineEntry({
  kind: "test/note",
  data: Schema.Struct({ body: Schema.String }),
  model: false,
  user: "shown",
});

const s1 = SessionId.make("s1");

/** Boots the repository's plugins folder in its own scope, as one run of Liminal. */
const run = <A, E>(use: (services: Context.Context<never>) => Effect.Effect<A, E>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;

      const booted = yield* boot({
        folders: [path.resolve(import.meta.dir, "../../../packages/plugins")],
      });

      const active = booted.status.flatMap((plugin) =>
        Predicate.isTagged(plugin, "Active") ? [plugin.name] : [],
      );

      expect(active.toSorted()).toEqual(["session-log", "session-store"]);

      return yield* use(booted.services);
    }),
  );

effectTest(
  "an entry appended before a restart reads back after it",
  Effect.gen(function* () {
    yield* run((services) =>
      Effect.gen(function* () {
        yield* Context.getUnsafe(services, EntryKinds).register(Note, { order: 0 });
        const log = Context.getUnsafe(services, SessionLog);
        yield* log.create(s1);
        yield* log.append(s1, [{ kind: Note.kind, data: { body: "a" }, text: "a" }]);
      }).pipe(Effect.scoped),
    );

    const read = yield* run((services) => Context.getUnsafe(services, SessionLog).read(s1, {}));

    expect(read.map((entry) => [entry.seq, entry.kind, entry.data])).toEqual([
      [Seq.make(1), "test/note", { body: "a" }],
    ]);
  }),
  testBaseServices,
);
