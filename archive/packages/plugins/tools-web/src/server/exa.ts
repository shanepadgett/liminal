/**
 * The searcher that needs no login: Exa's hosted MCP endpoint, free with a rate limit or with
 * `EXA_API_KEY`. Searches start at least 2 seconds apart, across all sessions.
 */

import { Clock, Config, Duration, Effect, Option, Redacted, Ref, Schema, Semaphore } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import type { WebQuery, WebSource } from "@liminal/sdk";

import { SearchFailed, type WebSearcher } from "../contract.ts";

const endpoint = "https://mcp.exa.ai/mcp";
const spacing = Duration.seconds(2);
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
  body.split(/\r?\n\r?\n/).flatMap((event) => {
    const data = event
      .split(/\r?\n/)
      .flatMap((line) => (line.startsWith("data:") ? [line.slice(5).trimStart()] : []))
      .join("\n");

    return data === "" ? [] : [data];
  });

/** Exa replies with plain JSON or with one event that holds it. */
const textOf = (body: string) => {
  const replies = [body, ...eventsOf(body)];

  if (replies.some(isRateLimited)) {
    return Effect.fail(failed("the free limit is reached; set EXA_API_KEY"));
  }

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
export const exaSources = (text: string): ReadonlyArray<WebSource> => {
  const lines = text.split("\n");

  return lines.flatMap((line, index) => {
    if (!line.startsWith("URL:")) return [];

    const url = line.slice(4).trim();
    const titleLine = lines.slice(0, index).findLast((earlier) => earlier.startsWith("Title:"));

    return [{ url, title: titleLine?.slice(6).trim() || url }];
  });
};

const requestOf = (query: WebQuery, key: Option.Option<Redacted.Redacted>) =>
  HttpClientRequest.post(endpoint).pipe(
    HttpClientRequest.setUrlParams(
      Option.match(key, {
        onNone: () => ({}),
        onSome: (value) => ({ exaApiKey: Redacted.value(value) }),
      }),
    ),
    HttpClientRequest.setHeader("accept", "application/json, text/event-stream"),
    HttpClientRequest.bodyJsonUnsafe({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "web_search_exa",
        arguments: {
          query: query.query,
          type: "auto",
          livecrawl: "fallback",
          numResults: query.maxSources,
          contextMaxCharacters: researchCharacters,
        },
      },
    }),
  );

/** Makes the Exa searcher; its spacing holds for every search the process makes. */
export const makeExa = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const key = yield* Config.option(Config.Redacted("EXA_API_KEY")).pipe(Effect.orDie);
  const turn = yield* Semaphore.make(1);
  const lastStart = yield* Ref.make(Number.NEGATIVE_INFINITY);

  const waitTurn = Semaphore.withPermit(turn)(
    Effect.gen(function* () {
      const wait =
        (yield* Ref.get(lastStart)) + Duration.toMillis(spacing) - (yield* Clock.currentTimeMillis);

      if (wait > 0) yield* Effect.sleep(Duration.millis(wait));

      yield* Ref.set(lastStart, yield* Clock.currentTimeMillis);
    }),
  );

  const searcher: WebSearcher = {
    name: "Exa",
    search: (query) =>
      Effect.gen(function* () {
        yield* waitTurn;

        const body = yield* http.execute(requestOf(query, key)).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap((response) => response.text),
          Effect.mapError((error) => failed(`it did not answer: ${error.message}`)),
        );

        const text = yield* textOf(body);

        return { text, sources: exaSources(text).slice(0, query.maxSources) };
      }),
  };

  return searcher;
});
