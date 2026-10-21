/** A stub HTTP client that keeps each request it was sent, and server-sent event replies. */

import { Effect, Predicate, Ref, Schema } from "effect";
import { type HttpBody, HttpClient, HttpClientResponse } from "effect/http";

/** One request as sent: where, its headers, and its JSON body. */
export interface Sent {
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Schema.Json;
}

const decodeBody = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));

const bodyOf = (body: HttpBody.HttpBody): Schema.Json =>
  Predicate.isTagged(body, "Uint8Array") ? decodeBody(new TextDecoder().decode(body.body)) : null;

/** Answers each request with `reply`, keeping it in `sent`. */
export const stubHttp = (sent: Ref.Ref<ReadonlyArray<Sent>>, reply: (url: URL) => Response) =>
  HttpClient.make((request) => {
    const url = new URL(request.url);

    return Effect.as(
      Ref.update(sent, (all) => [
        ...all,
        { url, headers: request.headers, body: bodyOf(request.body) },
      ]),
      HttpClientResponse.fromWeb(request, reply(url)),
    );
  });

/** A named server-sent event whose data is `type` and `fields`, as Anthropic and OpenAI send. */
export const event = (type: string, fields: Readonly<Record<string, Schema.Json>>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;

/** An unnamed server-sent event, as Chat Completions sends. */
export const dataEvent = (data: Schema.Json) => `data: ${JSON.stringify(data)}\n\n`;

/** An event stream response. */
export const eventStream = (events: ReadonlyArray<string>) =>
  new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
