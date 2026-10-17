/** Turns drafts into entries and stored rows, and stored rows back into entries. */

import { type DateTime, Effect, Schema } from "effect";

import type { StoredEntry } from "@liminal/session-store/contract";

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
  UnknownEntryKind,
  UserVisibility,
} from "../contract.ts";

/** An entry with its data as JSON; encodes to exactly the store's row. */
const EntryRow = Schema.Struct({
  sessionId: SessionId,
  seq: Seq,
  kind: Schema.String,
  at: Schema.DateTimeUtcFromMillis,
  data: Schema.fromJsonString(Schema.Json),
  model: Schema.NullOr(Schema.fromJsonString(Schema.Array(ModelContent))),
  text: Schema.String,
  user: UserVisibility,
});

type EntryRow = typeof EntryRow.Type;

export interface Prepared {
  readonly entry: Entry;
  readonly row: StoredEntry;
}

const findKind = (kinds: ReadonlyArray<EntryDefinition>, kind: string) =>
  kinds.find((definition) => definition.kind === kind);

const withModel = (
  entry: Omit<Entry, "model">,
  model: ReadonlyArray<ModelContentType> | null | undefined,
): Entry => (model === undefined || model === null ? entry : { ...entry, model });

/** Fails when the draft has model content and its kind has none, or the other way round. */
const checkModel = (definition: EntryDefinition, draft: EntryDraft) =>
  definition.model === (draft.model !== undefined)
    ? Effect.void
    : Effect.fail(
        new InvalidEntry({
          kind: draft.kind,
          message: definition.model
            ? "this kind needs model content"
            : "this kind carries no model content",
        }),
      );

const visibilityOf = Effect.fn("visibilityOf")(function* (
  definition: EntryDefinition,
  draft: EntryDraft,
) {
  if (definition.user !== "per-entry") return definition.user;
  if (draft.user !== undefined) return draft.user;

  return yield* new InvalidEntry({
    kind: draft.kind,
    message: "this kind needs a user visibility on each entry",
  });
});

/** Checks a draft against its kind and stamps it as entry `seq` of `session`. */
export const prepare = Effect.fn("prepare")(function* (
  draft: EntryDraft,
  kinds: ReadonlyArray<EntryDefinition>,
  stamp: { readonly sessionId: SessionId; readonly seq: Seq; readonly at: DateTime.Utc },
) {
  const definition = findKind(kinds, draft.kind);
  if (definition === undefined) return yield* new UnknownEntryKind({ kind: draft.kind });

  yield* checkModel(definition, draft);

  const json = yield* Schema.encodeUnknownEffect(definition.data)(draft.data).pipe(
    Effect.mapError((error) => new InvalidEntry({ kind: draft.kind, message: error.message })),
  );

  const fields = {
    ...stamp,
    kind: draft.kind,
    text: draft.text,
    user: yield* visibilityOf(definition, draft),
  };

  const row: EntryRow = { ...fields, data: json, model: draft.model ?? null };
  const stored = yield* Schema.encodeEffect(EntryRow)(row).pipe(Effect.orDie);

  const prepared: Prepared = {
    entry: withModel({ ...fields, data: draft.data }, draft.model),
    row: stored,
  };

  return prepared;
});

/** Decodes a stored row; a kind with no definition keeps its JSON data. */
export const restore = Effect.fn("restore")(function* (
  stored: StoredEntry,
  kinds: ReadonlyArray<EntryDefinition>,
) {
  const malformed = (error: Schema.SchemaError) =>
    new StoreError({
      message: `entry ${stored.seq} of session ${stored.sessionId} is malformed`,
      cause: error,
    });

  const row = yield* Schema.decodeEffect(EntryRow)(stored).pipe(Effect.mapError(malformed));
  const definition = findKind(kinds, row.kind);

  const data =
    definition === undefined
      ? row.data
      : yield* Schema.decodeEffect(definition.data)(row.data).pipe(Effect.mapError(malformed));

  return withModel({ ...row, data }, row.model);
});
