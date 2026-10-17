/** Sessions and their entries: the ids, the entry kinds plugins define, and the log's errors. */

import { type DateTime, Schema } from "effect";

import type { ModelContent } from "./model.ts";

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

/** Per session, from 1, without gaps. */
export const Seq = Schema.Int.pipe(Schema.brand("Seq"));
export type Seq = typeof Seq.Type;

export const UserVisibility = Schema.Literals(["shown", "hidden", "debug"]);
export type UserVisibility = typeof UserVisibility.Type;

/** An entry kind; `data` encodes to JSON so the entry reads back with its plugin off. */
export interface EntryDefinition<A = unknown> {
  /** Prefixed with the defining plugin's name, such as `questions/asked`. */
  readonly kind: string;
  readonly data: Schema.Codec<A, Schema.Json>;
  /** Whether entries of this kind carry ModelContent. */
  readonly model: boolean;
  /** Every entry's visibility, or `per-entry` when each draft sets its own. */
  readonly user: UserVisibility | "per-entry";
}

/**
 * Defines an entry kind in a plugin's contract. Register it with `EntryKinds` in the server so
 * entries read back decoded; writers pass it with each draft.
 */
export const defineEntry = <A>(definition: EntryDefinition<A>): EntryDefinition<A> => definition;

export interface Entry {
  readonly sessionId: SessionId;
  readonly seq: Seq;
  readonly kind: string;
  readonly at: DateTime.Utc;
  /** The kind's decoded data, or its JSON when no plugin defines the kind. */
  readonly data: unknown;
  /** Frozen when written. */
  readonly model?: ReadonlyArray<ModelContent>;
  /** Plain text for the user, frozen when written. */
  readonly text: string;
  readonly user: UserVisibility;
}

/** Build with `draft` so `data` matches its kind's type. */
export interface EntryDraft<A = unknown> {
  /** The writer's own definition; its schema checks `data`, whatever other builds register. */
  readonly entry: EntryDefinition<A>;
  readonly data: A;
  readonly model?: ReadonlyArray<ModelContent>;
  readonly text: string;
  /** Required when the kind's visibility is `per-entry`, ignored otherwise. */
  readonly user?: UserVisibility;
}

/** A draft of `entry` whose `data` has that kind's type. */
export const draft = <A>(
  entry: EntryDefinition<A>,
  fields: Omit<EntryDraft<A>, "entry">,
): EntryDraft<A> => ({ entry, ...fields });

export class SessionNotFound extends Schema.TaggedError<
  SessionNotFound,
  { readonly brand: unique symbol }
>()("SessionNotFound", { sessionId: Schema.String }) {}

/** A draft does not match its kind: wrong data, missing model content or missing visibility. */
export class InvalidEntry extends Schema.TaggedError<
  InvalidEntry,
  { readonly brand: unique symbol }
>()("InvalidEntry", { kind: Schema.String, message: Schema.String }) {}

export class StoreError extends Schema.TaggedError<StoreError, { readonly brand: unique symbol }>()(
  "StoreError",
  { message: Schema.String, cause: Schema.Defect() },
) {}
