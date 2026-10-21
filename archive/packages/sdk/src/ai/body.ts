/** Changes to a request's JSON body that an `@effect/ai-*` package cannot make itself. */

import { Option, Predicate, Schema } from "effect";
import { HttpClientRequest } from "effect/http";

/** A JSON request body's fields. */
export type BodyFields = Readonly<Record<string, Schema.Json>>;

const decodeBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
);

/**
 * Rewrites a request's JSON object body with `change`; any other body is left as it is. Use it in
 * `HttpClient.mapRequest` from a client's `transformClient`.
 */
export const mapJsonBody =
  (change: (body: BodyFields) => BodyFields) =>
  (request: HttpClientRequest.HttpClientRequest): HttpClientRequest.HttpClientRequest => {
    if (!Predicate.isTagged(request.body, "Uint8Array")) return request;

    return Option.match(decodeBody(new TextDecoder().decode(request.body.body)), {
      onNone: () => request,
      onSome: (body) => HttpClientRequest.bodyJsonUnsafe(request, change(body)),
    });
  };
