/** A session's entries: appending, reading and following them. */

import { Array as Arr, DateTime, Effect, Option, PubSub, Ref, Schema, Stream } from "effect";

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
import type { StoredEntry, StoreError as StoredStoreError } from "@liminal/session-store/contract";

import { NamedEntry, type SeqRange, UserEntry } from "../contract.ts";
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

/** A session's name: the first line of its first user message. */
const titleOf = (text: string) => text.trim().split("\n", 1)[0]?.trim() ?? "";

/** The name in the newest named entry among `drafts`. */
const nameOf = (drafts: ReadonlyArray<EntryDraft>) =>
  Arr.findLast(drafts, (draft) => draft.entry.kind === NamedEntry.kind).pipe(
    Option.flatMap((draft) => Schema.decodeUnknownOption(NamedEntry.data)(draft.data)),
    Option.map((data) => data.name),
  );

/**
 * Titles the session after the first user message among `drafts`, which a titled session keeps, and
 * names it after the newest named entry, which replaces any earlier name.
 */
const nameAfter = Effect.fn("SessionLog.nameAfter")(function* (
  deps: LogDeps,
  session: SessionId,
  drafts: ReadonlyArray<EntryDraft>,
) {
  const user = drafts.find((draft) => draft.entry.kind === UserEntry.kind);
  if (user !== undefined) yield* fromStore(deps.store.nameSession(session, titleOf(user.text)));

  const name = nameOf(drafts);
  if (Option.isSome(name)) yield* fromStore(deps.store.setName(session, name.value));
});

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

    yield* nameAfter(deps, session, drafts);
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

  /** Stored rows decoded with the registered kinds; a store failure is a `StoreError`. */
  const restored = (rows: Effect.Effect<ReadonlyArray<StoredEntry>, StoredStoreError>) =>
    rows.pipe(
      Effect.mapError((error) => new StoreError({ message: error.message, cause: error.cause })),
      Effect.flatMap((stored) =>
        Effect.forEach(stored, (row) => restore(row, deps.entryKinds.get)),
      ),
    );

  const lastOfKinds = Effect.fn("SessionLog.lastOfKinds")(function* (
    kinds: ReadonlyArray<EntryDefinition>,
  ) {
    return yield* restored(deps.store.lastEntriesOfKinds(kinds.map((each) => each.kind)));
  });

  const recentOfKinds = Effect.fn("SessionLog.recentOfKinds")(function* (
    kinds: ReadonlyArray<EntryDefinition>,
    since: DateTime.Utc,
  ) {
    return yield* restored(
      deps.store.recentEntriesOfKinds(
        kinds.map((each) => each.kind),
        DateTime.toEpochMillis(since),
      ),
    );
  });

  const subscribe = followWith(deps, read);
  const follow = followWith(deps, readSaved);

  return { read, append, lastOfKinds, recentOfKinds, subscribe, follow };
};
