/**
 * Typed keys for data plugins attach to records they do not own. Values are stored encoded, so keys
 * no plugin in the composition knows survive a round trip.
 */
import { Effect, Option, Schema } from "effect";

export interface Attribute<T> {
  /** Unique across plugins; prefix it with the plugin's name, as in `actors/Actor`. */
  readonly key: string;
  readonly schema: Schema.Codec<T, Schema.Json>;
}

/** Schema-encoded values by attribute key. */
export type Attributes = { readonly [key: string]: Schema.Json };

export class AttributeInvalid extends Schema.TaggedError<
  AttributeInvalid,
  { readonly brand: unique symbol }
>()("AttributeInvalid", { key: Schema.String, message: Schema.String }) {}

const make = <T>(key: string, schema: Schema.Codec<T, Schema.Json>): Attribute<T> => ({
  key,
  schema,
});

/** The attribute's value, or none when it is not set. */
const get = Effect.fn("Attribute.get")(function* <T>(
  attributes: Attributes,
  attribute: Attribute<T>,
) {
  const encoded = attributes[attribute.key];
  if (encoded === undefined) return Option.none<T>();

  const value = yield* Schema.decodeEffect(attribute.schema)(encoded).pipe(
    Effect.mapError(
      (error) =>
        new AttributeInvalid({
          key: attribute.key,
          message: `Attribute ${attribute.key} holds a value its schema rejects: ${error.message}. Remove or rewrite the stored value.`,
        }),
    ),
  );

  return Option.some(value);
});

/** `attributes` with the attribute set to `value`. A value its own schema cannot encode is a bug. */
const set = Effect.fn("Attribute.set")(function* <T>(
  attributes: Attributes,
  attribute: Attribute<T>,
  value: T,
) {
  const encoded = yield* Effect.orDie(Schema.encodeEffect(attribute.schema)(value));
  const updated: Attributes = { ...attributes, [attribute.key]: encoded };

  return updated;
});

export const Attribute = { make, get, set };
