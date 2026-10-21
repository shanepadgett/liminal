/** The reply-part metadata a provider keeps for its next request. */

import { Option, Predicate, Record, Schema } from "effect";
import type { Response } from "effect/ai";

/** A Schema over the metadata a provider keeps; keys it does not name are dropped. */
export type ProviderData = Schema.Decoder<Readonly<Record<string, Schema.Json>>>;

/** What `@effect/ai-openai` puts on reply parts: the item id and the encrypted reasoning. */
export const OpenAiData: ProviderData = Schema.Struct({
  openai: Schema.Struct({
    itemId: Schema.optionalKey(Schema.NullOr(Schema.String)),
    encryptedContent: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
});

type Kept = Readonly<Record<string, Schema.Json>>;

type Metadata = Response.ProviderMetadata | Kept;

/** Whether a JSON value is an object of fields. */
export const isFields = (value: Schema.Json): value is Kept =>
  Predicate.isObject(value) && !Array.isArray(value);

/**
 * `later` over `earlier`, merging each provider's fields: a part's start, deltas and end can each
 * carry some of what it keeps.
 */
export const mergeData = (earlier: Kept, later: Kept): Kept =>
  Record.union(earlier, later, (before, after) =>
    isFields(before) && isFields(after) ? Record.union(before, after, (_, newer) => newer) : after,
  );

/** Reads the kept metadata out of a part's metadata; none when it does not match. */
export const keptData = (data: ProviderData) => {
  const decode = Schema.decodeUnknownOption(data);

  return (metadata: Metadata): Kept => Option.getOrElse(decode(metadata), () => ({}));
};
