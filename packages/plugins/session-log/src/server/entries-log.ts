/** A session's entries: appending, reading and following them. */

import { Array as Arr, DateTime, Effect, PubSub, Ref, Stream } from "effect";

import {
  type Entry,
  type EntryDefinition,
  type EntryDraft,
  Seq,
  type SessionId,
  type SessionNotFound,
  StoreError,
  Synced,
} from "@liminal/sdk";

import type { SeqRange } from "../contract.ts";
import { fromStore, type LogDeps } from "./deps.ts";
import { prepare, restore, toSaved } from "./entries.ts";

/** Reads one session's entries in a seq range, in seq order. */
type Reader<A> = (
  session: SessionId,
  range: SeqRange,
) => Effect.Effect<ReadonlyArray<A>, SessionNotFound | StoreError>;

/**
 * The saved entries, Synced, then whatever each append signal reveals past the cursor. A session
 * not created yet reads as empty, so it can be followed from before its first prompt.
 */
const followWith =
  <A extends { readonly seq: Seq }>(deps: LogDeps, readAny: Reader<A>) =>
  (session: SessionId, from: { readonly after?: Seq }) => {
    const read: Reader<A> = (each, range) =>
      readAny(each, range).pipe(
        Effect.catchTag("SessionNotFound", () => Effect.succeed<ReadonlyArray<A>>([])),
      );

    return Stream.unwrap(
      Effect.gen(function* () {
        const signals = yield* PubSub.subscribe(deps.appended);
        const saved = yield* read(session, from);
        const cursor = yield* Ref.make(saved.at(-1)?.seq ?? from.after);

        const readNew = Effect.gen(function* () {
          const after = yield* Ref.get(cursor);
          const entries = yield* read(session, after === undefined ? {} : { after });
          const newest = entries.at(-1);
          if (newest !== undefined) yield* Ref.set(cursor, newest.seq);

          return entries;
        });

        const followed = Stream.fromSubscription(signals).pipe(
          Stream.filter((signal) => signal === session),
          Stream.mapEffect(() => readNew),
          Stream.flattenIterable,
        );

        const last = yield* Ref.get(cursor);
        const synced = last === undefined ? new Synced({}) : new Synced({ seq: last });

        return Stream.fromIterable<A | Synced>(saved).pipe(
          Stream.concat(Stream.succeed(synced)),
          Stream.concat(followed),
        );
      }),
    );
  };

export const makeEntries = (deps: LogDeps) => {
  const read = Effect.fn("SessionLog.read")(function* (session: SessionId, range: SeqRange) {
    const stored = yield* fromStore(deps.store.readEntries(session, range));

    return yield* Effect.forEach(stored, (row) => restore(row, deps.entryKinds.get));
  });

  const append = Effect.fn("SessionLog.append")(function* (
    session: SessionId,
    drafts: readonly [EntryDraft, ...Array<EntryDraft>],
  ) {
    const at = yield* DateTime.now;

    const prepared = yield* Effect.all(
      Arr.map(drafts, (draft) => prepare(draft, { sessionId: session, at })),
    );

    const saved = yield* fromStore(
      deps.store.appendEntries(
        session,
        Arr.map(prepared, (each) => each.row),
      ),
    );

    yield* PubSub.publish(deps.appended, session);

    return Arr.zipWith(prepared, saved, (each, row): Entry => ({
      ...each.entry,
      seq: Seq.make(row.seq),
    }));
  });

  /** Decoded rows as clients receive them, data left as JSON. */
  const readSaved = Effect.fn("SessionLog.readSaved")(function* (
    session: SessionId,
    range: SeqRange,
  ) {
    const stored = yield* fromStore(deps.store.readEntries(session, range));

    return yield* Effect.forEach(stored, toSaved);
  });

  const lastOfKinds = Effect.fn("SessionLog.lastOfKinds")(function* (
    kinds: ReadonlyArray<EntryDefinition>,
  ) {
    const stored = yield* deps.store
      .lastEntriesOfKinds(kinds.map((definition) => definition.kind))
      .pipe(
        Effect.mapError((error) => new StoreError({ message: error.message, cause: error.cause })),
      );

    return yield* Effect.forEach(stored, (row) => restore(row, deps.entryKinds.get));
  });

  const subscribe = followWith(deps, read);
  const follow = followWith(deps, readSaved);

  return { read, append, lastOfKinds, subscribe, follow };
};
