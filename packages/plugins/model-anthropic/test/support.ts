/** A stub HTTP client answering by host and path, keeping each request it was sent. */

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

/** A server-sent event as Anthropic streams it. */
export const event = (type: string, fields: Readonly<Record<string, Schema.Json>>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;

/** An event stream response. */
export const eventStream = (events: ReadonlyArray<string>) =>
  new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
