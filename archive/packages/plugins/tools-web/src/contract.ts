/**
 * Web tools: the searchers `websearch` tries in order, and the params of `websearch` and
 * `webfetch`.
 */

import { Effect, Option, Schema } from "effect";

import { type ModelError, Registry, type WebAnswer, type WebQuery } from "@liminal/sdk";

/** A searcher could not answer, such as one without a login. */
export class SearchFailed extends Schema.TaggedError<
  SearchFailed,
  { readonly brand: unique symbol }
>()("SearchFailed", { message: Schema.String }) {}

/** One way to search the web, such as a provider's own search tool. */
export interface WebSearcher {
  /** Named in the answer and in failures. */
  readonly name: string;
  readonly search: (query: WebQuery) => Effect.Effect<WebAnswer, SearchFailed>;
}

/**
 * The searchers by order; `websearch` answers with the first that works. Providers register at
 * `searcherOrder.provider`; the fallback that needs no login comes last.
 */
export class WebSearchers extends Registry.Service<WebSearchers, WebSearcher>()(
  "liminal/tools-web/WebSearchers",
) {}

export const searcherOrder: { readonly provider: number; readonly fallback: number } = {
  provider: 0,
  fallback: 100,
};

/** A provider's search as a searcher, its model errors as search failures. */
export const providerSearcher = (
  name: string,
  search: (query: WebQuery) => Effect.Effect<WebAnswer, ModelError>,
): WebSearcher => ({
  name,
  search: (query) =>
    search(query).pipe(Effect.mapError((error) => new SearchFailed({ message: error.message }))),
});

/** Registers a provider plugin's searchers when the web tools are loaded. */
export const offerSearchers = (searchers: ReadonlyArray<WebSearcher>) =>
  Effect.flatMap(
    Effect.serviceOption(WebSearchers),
    Option.match({
      onNone: () => Effect.void,
      onSome: (registry) =>
        Effect.forEach(
          searchers,
          (searcher) => registry.register(searcher, { order: searcherOrder.provider }),
          { discard: true },
        ),
    }),
  );

/** Most sources a search gives. */
export const maxSources = 12;

export const SearchParams = Schema.Struct({
  query: Schema.NonEmptyString.annotate({ description: "What to find out" }),
  maxSources: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: maxSources })).annotate({
      description: "Most sources to give; 8 when left out",
    }),
  ),
  timeout: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 300 })).annotate({
      description: "Seconds before the search gives up; 25 when left out",
    }),
  ),
});

export type SearchParams = typeof SearchParams.Type;

export const FetchParams = Schema.Struct({
  url: Schema.String.annotate({ description: "The http or https address to read" }),
  timeout: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 300 })).annotate({
      description: "Seconds before the fetch gives up; 30 when left out",
    }),
  ),
});

export type FetchParams = typeof FetchParams.Type;
