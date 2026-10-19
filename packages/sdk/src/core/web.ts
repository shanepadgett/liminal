/** Web search shapes shared by the web tools and the providers that search on their side. */

/** One search: what to find and how many sources to give at most. */
export interface WebQuery {
  readonly query: string;
  readonly maxSources: number;
}

/** A page an answer drew on. */
export interface WebSource {
  readonly url: string;
  readonly title: string;
}

/** A search's answer: text with inline Markdown links, and the pages it drew on. */
export interface WebAnswer {
  readonly text: string;
  readonly sources: ReadonlyArray<WebSource>;
}
