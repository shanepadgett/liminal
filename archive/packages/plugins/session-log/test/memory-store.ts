/** An in-memory SessionStore, so session-log tests run without SQLite. */

import { Array as Arr, Effect, Layer, Ref } from "effect";

import {
  SessionNotFound,
  SessionStore,
  type StoredEntry,
  type StoredLive,
  type StoredSession,
} from "@liminal/session-store/contract";

interface MemorySession {
  readonly workspace: string;
  readonly title: string;
  readonly name: string;
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

const withEntries = (
  sessions: Sessions,
  id: string,
  entries: ReadonlyArray<StoredEntry>,
): Sessions => {
  const session = sessions.get(id);
  if (session === undefined) return sessions;

  return new Map(sessions).set(id, { ...session, entries: [...session.entries, ...entries] });
};

const empty = (workspace: string): MemorySession => ({
  workspace,
  title: "",
  name: "",
  parent: undefined,
  entries: [],
  live: undefined,
});

const make = Effect.gen(function* () {
  const ref = yield* Ref.make<Sessions>(new Map());

  const put = (id: string, session: MemorySession) =>
    Ref.update(ref, (sessions) => new Map(sessions).set(id, session));

  const existing = (id: string) => Effect.flatMap(Ref.get(ref), (sessions) => find(sessions, id));

  return SessionStore.of({
    createSession: (id, workspace) => put(id, empty(workspace)),
    forkSession: (id, parent, seq) =>
      Effect.flatMap(existing(parent), (found) =>
        put(id, {
          ...empty(found.workspace),
          title: found.title,
          name: found.name,
          parent: { id: parent, seq },
        }),
      ),
    setName: (id, name) => Effect.flatMap(existing(id), (session) => put(id, { ...session, name })),
    nameSession: (id, title) =>
      Effect.flatMap(existing(id), (session) =>
        session.title === "" ? put(id, { ...session, title }) : Effect.void,
      ),
    appendEntries: Effect.fn(function* (id, entries) {
      const sessions = yield* Ref.get(ref);
      yield* find(sessions, id);
      const last = lastSeqOf(sessions, id);

      const stored = Arr.map(entries, (entry, index): StoredEntry => ({
        ...entry,
        sessionId: id,
        seq: last + index + 1,
      }));

      yield* Ref.set(ref, withEntries(sessions, id, stored));

      return stored;
    }),
    readEntries: (id, range) =>
      Effect.map(Ref.get(ref), (sessions) =>
        allEntries(sessions, id).filter(
          (entry) =>
            (range.after === undefined || entry.seq > range.after)
            && (range.through === undefined || entry.seq <= range.through),
        ),
      ).pipe(Effect.tap(() => existing(id))),
    listSessions: (workspace) =>
      Effect.map(Ref.get(ref), (sessions) =>
        [...sessions].flatMap(([id, session]): ReadonlyArray<StoredSession> =>
          session.workspace === workspace
            ? [
                {
                  id,
                  parentId: session.parent?.id ?? null,
                  workspace,
                  title: session.title,
                  name: session.name,
                  createdAt: 0,
                  updatedAt: session.entries.at(-1)?.at ?? 0,
                  lastSeq: lastSeqOf(sessions, id),
                },
              ]
            : [],
        ),
      ),
    lastEntriesOfKinds: (kinds) =>
      Effect.map(Ref.get(ref), (sessions) =>
        [...sessions.values()].flatMap((session) =>
          session.entries.filter((entry) => kinds.includes(entry.kind)).slice(-1),
        ),
      ),
    recentEntriesOfKinds: (kinds, since) =>
      Effect.map(Ref.get(ref), (sessions) =>
        [...sessions]
          .toSorted(([left], [right]) => left.localeCompare(right))
          .flatMap(([, session]) =>
            (session.entries.at(-1)?.at ?? 0) >= since
              ? session.entries.filter((entry) => kinds.includes(entry.kind))
              : [],
          ),
      ),
    renameKind: (from, to) =>
      Ref.update(
        ref,
        (sessions) =>
          new Map(
            [...sessions].map(([id, session]) => [
              id,
              {
                ...session,
                entries: session.entries.map((entry) =>
                  entry.kind === from ? { ...entry, kind: to } : entry,
                ),
              },
            ]),
          ),
      ),
    readLive: (id) => Effect.map(existing(id), (session) => session.live),
    writeLive: (id, live) =>
      Effect.flatMap(existing(id), (session) => put(id, { ...session, live })),
  });
});

/** A fresh, empty store per build. */
export const memoryStore = Layer.effect(SessionStore, make);
