/** The reply-part metadata a provider keeps for its next request. */

import { Option, Schema } from "effect";
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

type Metadata = Response.ProviderMetadata | Readonly<Record<string, Schema.Json>>;

/** Reads the kept metadata out of a part's metadata; none when it does not match. */
export const keptData = (data: ProviderData) => {
  const decode = Schema.decodeUnknownOption(data);

  return (metadata: Metadata): Readonly<Record<string, Schema.Json>> =>
    Option.getOrElse(decode(metadata), () => ({}));
};
