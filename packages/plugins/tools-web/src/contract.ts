/** The web tools' names, the hosted searchers `websearch` can use, and what both tools save. */
import { type Effect, Schema } from "effect";

import { Registry } from "@shanepadgett/liminal-core";
import { defineEvent } from "@shanepadgett/liminal-session/contract";

/** The search tool's name. */
export const websearchName = "websearch";

/** The fetch tool's name. */
export const webfetchName = "webfetch";

/** A page a search answer drew on. */
export const WebSource = Schema.Struct({ url: Schema.String, title: Schema.String });
export type WebSource = typeof WebSource.Type;

/** A search's answer: text for the model, and the pages it drew on. */
export interface WebAnswer {
  readonly text: string;
  readonly sources: ReadonlyArray<WebSource>;
}

/** A searcher could not answer; the model sees `message` when no other searcher can either. */
export class SearchFailed extends Schema.TaggedError<
  SearchFailed,
  { readonly brand: unique symbol }
>()("SearchFailed", { message: Schema.String }) {}

/** A model provider's own web search. */
export interface WebSearcher {
  /** The `ModelProvider` id whose sessions use this searcher. */
  readonly provider: string;
  /** Shown in the answer and its row, such as "Claude". */
  readonly name: string;
  readonly search: (query: string) => Effect.Effect<WebAnswer, SearchFailed>;
}

/**
 * Hosted searchers by provider; a session searches with its model's provider's, else Exa. Of two
 * for one provider, the one added last is used.
 */
export class WebSearchers extends Registry.Service<WebSearchers, WebSearcher>()(
  "tools-web/WebSearchers",
) {}

/** A `websearch` call's answer: which searcher gave it, and its sources. */
export const Searched = defineEvent(
  "tools-web/searched",
  Schema.Struct({
    callId: Schema.String,
    searcher: Schema.String,
    sources: Schema.Array(WebSource),
  }),
);

/** A `webfetch` call's page: its final address, status and type. */
export const Fetched = defineEvent(
  "tools-web/fetched",
  Schema.Struct({
    callId: Schema.String,
    url: Schema.String,
    status: Schema.Int,
    type: Schema.String,
  }),
);
