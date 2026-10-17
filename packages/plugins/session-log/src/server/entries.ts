/** Turns drafts into entries and stored rows, and stored rows back into entries. */

import { type DateTime, Effect, Option, Schema } from "effect";

import {
  type Entry,
  type EntryDefinition,
  type EntryDraft,
  InvalidEntry,
  ModelContent,
  type ModelContent as ModelContentType,
  Seq,
  SessionId,
  StoreError,
  UserVisibility,
} from "@liminal/sdk";
import type { NewEntry, StoredEntry } from "@liminal/session-store/contract";

/** A new entry's fields with its data as JSON; encodes to exactly the store's new row. */
const NewEntryRow = Schema.Struct({
  kind: Schema.String,
  at: Schema.DateTimeUtcFromMillis,
  data: Schema.fromJsonString(Schema.Json),
  model: Schema.NullOr(Schema.fromJsonString(Schema.Array(ModelContent))),
  text: Schema.String,
  user: UserVisibility,
});

/** A stored entry with its data as JSON; decodes from exactly the store's row. */
const EntryRow = Schema.Struct({ ...NewEntryRow.fields, sessionId: SessionId, seq: Seq });

type EntryRow = typeof EntryRow.Type;

/** A checked draft: the entry it becomes once the store numbers it, and the row to save. */
export interface Prepared {
  readonly entry: Omit<Entry, "seq">;
  readonly row: NewEntry;
}

const withModel = <E extends Omit<Entry, "model" | "seq">>(
  entry: E,
  model: ReadonlyArray<ModelContentType> | null | undefined,
): E & Pick<Entry, "model"> =>
  model === undefined || model === null ? entry : { ...entry, model };

/** Fails when the draft has model content and its kind has none, or the other way round. */
const checkModel = (draft: EntryDraft) =>
  draft.entry.model === (draft.model !== undefined)
    ? Effect.void
    : Effect.fail(
        new InvalidEntry({
          kind: draft.entry.kind,
          message: draft.entry.model
            ? "this kind needs model content"
            : "this kind carries no model content",
        }),
      );

const visibilityOf = Effect.fn("visibilityOf")(function* (draft: EntryDraft) {
  if (draft.entry.user !== "per-entry") return draft.entry.user;
  if (draft.user !== undefined) return draft.user;

  return yield* new InvalidEntry({
    kind: draft.entry.kind,
    message: "this kind needs a user visibility on each entry",
  });
});

/** Checks a draft against the writer's own definition of its kind. */
export const prepare = Effect.fn("prepare")(function* (
  draft: EntryDraft,
  stamp: { readonly sessionId: SessionId; readonly at: DateTime.Utc },
) {
  const { kind } = draft.entry;
  yield* checkModel(draft);

  const json = yield* Schema.encodeUnknownEffect(draft.entry.data)(draft.data).pipe(
    Effect.mapError((error) => new InvalidEntry({ kind, message: error.message })),
  );

  const fields = { kind, at: stamp.at, text: draft.text, user: yield* visibilityOf(draft) };
  const row = { ...fields, data: json, model: draft.model ?? null };
  const stored = yield* Schema.encodeEffect(NewEntryRow)(row).pipe(Effect.orDie);

  const prepared: Prepared = {
    entry: withModel({ ...fields, sessionId: stamp.sessionId, data: draft.data }, draft.model),
    row: stored,
  };

  return prepared;
});

/** Decodes a stored row with the newest definition of its kind; a kind with none keeps its JSON. */
export const restore = Effect.fn("restore")(function* (
  stored: StoredEntry,
  definitionOf: (kind: string) => Effect.Effect<Option.Option<EntryDefinition>>,
) {
  const malformed = (error: Schema.SchemaError) =>
    new StoreError({
      message: `entry ${stored.seq} of session ${stored.sessionId} is malformed`,
      cause: error,
    });

  const row: EntryRow = yield* Schema.decodeEffect(EntryRow)(stored).pipe(
    Effect.mapError(malformed),
  );

  const definition = yield* definitionOf(row.kind);

  const data = Option.isNone(definition)
    ? row.data
    : yield* Schema.decodeEffect(definition.value.data)(row.data).pipe(Effect.mapError(malformed));

  const entry: Entry = withModel({ ...row, data }, row.model);

  return entry;
});
