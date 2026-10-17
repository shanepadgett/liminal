/** A session's entries: appending, reading and following them. */

import { Array as Arr, DateTime, Effect, PubSub, Ref, Stream } from "effect";

import {
  type Entry,
  type EntryDraft,
  Seq,
  type SeqRange,
  type SessionId,
  Synced,
} from "../contract.ts";
import { fromStore, type LogDeps } from "./deps.ts";
import { prepare, restore } from "./entries.ts";

export const makeEntries = (deps: LogDeps) => {
  const read = Effect.fn("SessionLog.read")(function* (session: SessionId, range: SeqRange) {
    const stored = yield* fromStore(deps.store.readEntries(session, range));
    const kinds = yield* deps.entryKinds.list;

    return yield* Effect.forEach(stored, (row) => restore(row, kinds));
  });

  const append = Effect.fn("SessionLog.append")(function* (
    session: SessionId,
    drafts: readonly [EntryDraft, ...Array<EntryDraft>],
  ) {
    const kinds = yield* deps.entryKinds.list;
    const last = yield* fromStore(deps.store.lastSeq(session));
    const at = yield* DateTime.now;

    const prepared = yield* Effect.all(
      Arr.map(drafts, (draft, index) =>
        prepare(draft, kinds, { sessionId: session, seq: Seq.make(last + index + 1), at }),
      ),
    );

    yield* fromStore(deps.store.saveEntries(Arr.map(prepared, (each) => each.row)));
    yield* PubSub.publish(deps.appended, session);

    return Arr.map(prepared, (each): Entry => each.entry);
  });

  /** The saved entries, Synced, then whatever each append signal reveals past the cursor. */
  const subscribe = (session: SessionId, from: { readonly after?: Seq }) =>
    Stream.unwrap(
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

        const synced = new Synced({ seq: yield* Ref.get(cursor) });

        return Stream.fromIterable<Entry | Synced>(saved).pipe(
          Stream.concat(Stream.succeed(synced)),
          Stream.concat(followed),
        );
      }),
    );

  return {
    read,
    append: (session: SessionId, drafts: readonly [EntryDraft, ...Array<EntryDraft>]) =>
      deps.lock.withPermit(append(session, drafts)),
    subscribe,
  };
};
