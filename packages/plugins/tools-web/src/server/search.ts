/**
 * `websearch`: asks each searcher in order until one answers. A searcher that has others after it
 * gets most of the time left, so a slow one still leaves time for the next.
 */

import { Clock, Duration, Effect, Result } from "effect";

import { ToolFailed, type WebAnswer, type WebQuery } from "@liminal/sdk";

import { SearchFailed, type WebSearcher } from "../contract.ts";

/** The part of the time left a searcher gets when others wait after it. */
const share = 0.7;

/** One searcher's answer, or why it failed. */
const tryOne = (searcher: WebSearcher, query: WebQuery, limit: Duration.Duration) =>
  searcher
    .search(query)
    .pipe(
      Effect.timeoutOrElse({
        duration: limit,
        orElse: () =>
          Effect.fail(
            new SearchFailed({ message: `no answer in ${Duration.toSeconds(limit)} seconds` }),
          ),
      }),
      Effect.result,
    );

const answered = (name: string, answer: WebAnswer) =>
  [
    answer.text,
    ...(answer.sources.length === 0
      ? []
      : ["", "Sources:", ...answer.sources.map(({ url, title }) => `- [${title}](${url})`)]),
    "",
    `Searched with ${name}.`,
  ].join("\n");

const attempt = (
  searchers: ReadonlyArray<WebSearcher>,
  query: WebQuery,
  state: { readonly left: Duration.Duration; readonly failures: ReadonlyArray<string> },
): Effect.Effect<string, ToolFailed> =>
  Effect.gen(function* () {
    const [searcher, ...rest] = searchers;

    if (searcher === undefined || Duration.isLessThanOrEqualTo(state.left, Duration.zero)) {
      const reasons =
        state.failures.length === 0 ? "no searcher is loaded" : state.failures.join("; ");

      return yield* new ToolFailed({ message: `Web search failed: ${reasons}` });
    }

    const limit = rest.length === 0 ? state.left : Duration.times(state.left, share);
    const started = yield* Clock.currentTimeMillis;
    const result = yield* tryOne(searcher, query, limit);
    if (Result.isSuccess(result)) return answered(searcher.name, result.success);

    const spent = Duration.millis((yield* Clock.currentTimeMillis) - started);

    return yield* attempt(rest, query, {
      left: Duration.subtract(state.left, spent),
      failures: [...state.failures, `${searcher.name}: ${result.failure.message}`],
    });
  });

/** The first answer of `searchers` within `timeout`, as the tool's text. */
export const searchWeb = (
  searchers: ReadonlyArray<WebSearcher>,
  query: WebQuery,
  timeout: Duration.Duration,
) => attempt(searchers, query, { left: timeout, failures: [] });
