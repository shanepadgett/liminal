/** An in-memory SessionStore, so session-log tests run without SQLite. */

import { Effect, Layer, Ref } from "effect";

import {
  SessionNotFound,
  SessionStore,
  type StoredEntry,
  StoreError,
  type StoredLive,
} from "@liminal/session-store/contract";

interface MemorySession {
  readonly parent: { readonly id: string; readonly seq: number } | undefined;
  readonly entries: ReadonlyArray<StoredEntry>;
  readonly live: StoredLive | undefined;
}

type Sessions = ReadonlyMap<string, MemorySession>;

const find = (sessions: Sessions, id: string) => {
  const session = sessions.get(id);

  return session === undefined
    ? Effect.fail(new SessionNotFound({ sessionId: id }))
    : Effect.succeed(session);
};

/** A session's entries with its fork parents' entries first. */
const allEntries = (sessions: Sessions, id: string): ReadonlyArray<StoredEntry> => {
  const session = sessions.get(id);
  if (session === undefined) return [];
  if (session.parent === undefined) return session.entries;
  const { seq } = session.parent;

  return [
    ...allEntries(sessions, session.parent.id).filter((entry) => entry.seq <= seq),
    ...session.entries,
  ];
};

const lastSeqOf = (sessions: Sessions, id: string) =>
  Math.max(0, ...allEntries(sessions, id).map((entry) => entry.seq));

const taken = (sessions: Sessions, entries: ReadonlyArray<StoredEntry>) =>
  entries.some(
    (entry, index) =>
      allEntries(sessions, entry.sessionId).some((saved) => saved.seq === entry.seq)
      || entries.findIndex(
        (other) => other.sessionId === entry.sessionId && other.seq === entry.seq,
      ) !== index,
  );

const withEntries = (sessions: Sessions, entries: ReadonlyArray<StoredEntry>): Sessions => {
  const next = new Map(sessions);

  for (const entry of entries) {
    const session = next.get(entry.sessionId);

    if (session !== undefined)
      next.set(entry.sessionId, { ...session, entries: [...session.entries, entry] });
  }

  return next;
};

const make = Effect.gen(function* () {
  const ref = yield* Ref.make<Sessions>(new Map());
  const empty: MemorySession = { parent: undefined, entries: [], live: undefined };

  const put = (id: string, session: MemorySession) =>
    Ref.update(ref, (sessions) => new Map(sessions).set(id, session));

  const existing = (id: string) => Effect.flatMap(Ref.get(ref), (sessions) => find(sessions, id));

  return SessionStore.of({
    createSession: (id) => put(id, empty),
    forkSession: (id, parent, seq) =>
      Effect.flatMap(existing(parent), () => put(id, { ...empty, parent: { id: parent, seq } })),
    saveEntries: Effect.fn(function* (entries) {
      const sessions = yield* Ref.get(ref);
      for (const entry of entries) yield* find(sessions, entry.sessionId);

      if (taken(sessions, entries))
        return yield* new StoreError({ message: "seq already taken", cause: undefined });

      return yield* Ref.set(ref, withEntries(sessions, entries));
    }),
    readEntries: (id, range) =>
      Effect.map(Ref.get(ref), (sessions) =>
        allEntries(sessions, id).filter(
          (entry) =>
            (range.after === undefined || entry.seq > range.after)
            && (range.through === undefined || entry.seq <= range.through),
        ),
      ).pipe(Effect.tap(() => existing(id))),
    lastSeq: (id) =>
      Effect.flatMap(existing(id), () =>
        Effect.map(Ref.get(ref), (sessions) => lastSeqOf(sessions, id)),
      ),
    readLive: (id) => Effect.map(existing(id), (session) => session.live),
    writeLive: (id, live) =>
      Effect.flatMap(existing(id), (session) => put(id, { ...session, live })),
  });
});

/** A fresh, empty store per build. */
export const memoryStore = Layer.effect(SessionStore, make);
