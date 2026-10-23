/**
 * Exa's hosted MCP search: the searcher every session can use, free under a rate limit. Searches
 * start at least 2 seconds apart, across all sessions.
 */
import { Clock, Duration, Effect, Option, Ref, Schema, Semaphore } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { SearchFailed, type WebAnswer, type WebSource } from "./contract.ts";

const endpoint = "https://mcp.exa.ai/mcp";
const spacing = Duration.seconds(2);
const maxSources = 8;
const researchCharacters = 10_000;

const Reply = Schema.Struct({
  result: Schema.optional(
    Schema.Struct({
      isError: Schema.optional(Schema.Boolean),
      content: Schema.Array(
        Schema.Struct({ type: Schema.String, text: Schema.optional(Schema.String) }),
      ),
    }),
  ),
  error: Schema.optional(Schema.Struct({ message: Schema.String })),
});

const decodeReply = Schema.decodeUnknownOption(Schema.fromJsonString(Reply));

/** A rate-limited reply is an ordinary result asking for a key; only its meta marks it. */
const isRateLimited = Schema.is(
  Schema.fromJsonString(
    Schema.Struct({
      result: Schema.Struct({
        _meta: Schema.Struct({ "ai.exa/rateLimited": Schema.Literal(true) }),
      }),
    }),
  ),
);

const failed = (message: string) => new SearchFailed({ message });

/** The JSON of each server-sent event in `body`. */
const eventsOf = (body: string) =>
  body.split(/\r?\n\r?\n/u).flatMap((event) => {
    const data = event
      .split(/\r?\n/u)
      .flatMap((line) => (line.startsWith("data:") ? [line.slice(5).trimStart()] : []))
      .join("\n");

    return data === "" ? [] : [data];
  });

/** Exa replies with plain JSON or with one event that holds it. */
const textOf = (body: string) => {
  const replies = [body, ...eventsOf(body)];
  if (replies.some(isRateLimited)) return Effect.fail(failed("the free limit is reached"));

  const reply = Option.firstSomeOf(replies.map((json) => decodeReply(json)));
  if (Option.isNone(reply)) return Effect.fail(failed("its reply could not be read"));

  const { result, error } = reply.value;
  if (error !== undefined) return Effect.fail(failed(error.message));
  if (result === undefined) return Effect.fail(failed("it sent no result"));

  const text = result.content.flatMap((part) => (part.text === undefined ? [] : [part.text]));
  if (result.isError === true) return Effect.fail(failed(text.join("\n")));

  return Effect.succeed(text.length === 0 ? "No results." : text.join("\n"));
};

/** Exa's text gives each result a `Title:` line, then a `URL:` line. */
const sourcesOf = (text: string): ReadonlyArray<WebSource> => {
  const lines = text.split("\n");

  return lines.flatMap((line, index) => {
    if (!line.startsWith("URL:")) return [];

    const url = line.slice(4).trim();
    const titleLine = lines.slice(0, index).findLast((earlier) => earlier.startsWith("Title:"));
    const title = titleLine?.slice(6).trim() ?? "";

    return [{ url, title: title === "" ? url : title }];
  });
};

const requestOf = (query: string) =>
  HttpClientRequest.post(endpoint).pipe(
    HttpClientRequest.setHeader("accept", "application/json, text/event-stream"),
    HttpClientRequest.bodyJsonUnsafe({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "web_search_exa",
        arguments: {
          query,
          type: "auto",
          livecrawl: "fallback",
          numResults: maxSources,
          contextMaxCharacters: researchCharacters,
        },
      },
    }),
  );

/** Makes Exa's search; its spacing holds for every search the process makes. */
export const makeExa = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const turn = yield* Semaphore.make(1);
  const lastStart = yield* Ref.make(Number.NEGATIVE_INFINITY);

  const waitTurn = Semaphore.withPermit(turn)(
    Effect.gen(function* () {
      const startAt = (yield* Ref.get(lastStart)) + Duration.toMillis(spacing);
      const wait = startAt - (yield* Clock.currentTimeMillis);
      if (wait > 0) yield* Effect.sleep(Duration.millis(wait));

      yield* Ref.set(lastStart, yield* Clock.currentTimeMillis);
    }),
  );

  return Effect.fn("Exa.search")(function* (query: string) {
    yield* waitTurn;

    const body = yield* http.execute(requestOf(query)).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.text),
      Effect.mapError((error) => failed(`it did not answer: ${error.message}`)),
    );

    const text = yield* textOf(body);
    const answer: WebAnswer = { text, sources: sourcesOf(text).slice(0, maxSources) };

    return answer;
  });
});
