/**
 * `websearch`: the session model's provider's hosted search, else Exa. A hosted search that fails
 * falls back to Exa.
 */
import { Duration, Effect, Schema } from "effect";

import { SessionLog } from "@shanepadgett/liminal-session/contract";
import {
  defineTool,
  noAccess,
  ToolFailed,
  type ToolContext,
} from "@shanepadgett/liminal-tools/contract";

import {
  SearchFailed,
  Searched,
  type WebAnswer,
  type WebSearcher,
  WebSearchers,
  websearchName,
} from "./contract.ts";
import { makeExa } from "./exa.ts";
import { untrusted } from "./notice.ts";

const description = `Search the web and get an answer with its sources. Use it for anything newer than your training or outside the workspace, such as current docs, releases or errors.

To read one page whose address you have, use webfetch.`;

const Input = Schema.Struct({
  query: Schema.NonEmptyString.annotate({ description: "What to find out." }),
});

type Input = typeof Input.Type;

const limit = Duration.seconds(30);

/** An answer and the searcher that gave it. */
interface Found {
  readonly searcher: string;
  readonly answer: WebAnswer;
}

/** `search` within the time limit. */
const within = (searcher: string, search: Effect.Effect<WebAnswer, SearchFailed>) =>
  search.pipe(
    Effect.timeoutOrElse({
      duration: limit,
      orElse: () =>
        Effect.fail(
          new SearchFailed({ message: `no answer in ${Duration.toSeconds(limit)} seconds` }),
        ),
    }),
    Effect.map((answer): Found => ({ searcher, answer })),
  );

const searchFailed = (reasons: string) =>
  new ToolFailed({ message: `Web search failed: ${reasons}` });

/** The text the model sees. */
const textOf = ({ searcher, answer }: Found) =>
  [
    untrusted,
    "",
    answer.text,
    ...(answer.sources.length === 0
      ? []
      : ["", "Sources:", ...answer.sources.map(({ url, title }) => `- [${title}](${url})`)]),
    "",
    `Searched with ${searcher}.`,
  ].join("\n");

export const makeSearch = Effect.gen(function* () {
  const searchers = yield* WebSearchers;
  const log = yield* SessionLog;
  const exa = yield* makeExa;

  /** Exa's answer; a failure names `before`, the hosted search's reason, when there was one. */
  const viaExa = (query: string, before: string) =>
    within("Exa", exa(query)).pipe(
      Effect.mapError((error) => searchFailed(`${before}Exa: ${error.message}`)),
    );

  const answerOf = (hosted: WebSearcher | undefined, query: string) =>
    hosted === undefined
      ? viaExa(query, "")
      : within(hosted.name, hosted.search(query)).pipe(
          Effect.catch((error) => viaExa(query, `${hosted.name}: ${error.message}; `)),
        );

  const run = (input: Input, { session, callId, model }: ToolContext) =>
    Effect.gen(function* () {
      const [provider] = model.split("/");
      const hosted = (yield* searchers.list).findLast((searcher) => searcher.provider === provider);
      const found = yield* answerOf(hosted, input.query);

      const sources = found.answer.sources;

      yield* log.append(session, [
        yield* Searched.make({ callId, searcher: found.searcher, sources }),
      ]);

      return { content: [{ type: "text" as const, text: textOf(found) }] };
    }).pipe(Effect.mapError(({ message }) => new ToolFailed({ message })));

  return defineTool({
    name: websearchName,
    description,
    input: Input,
    access: () => noAccess,
    run,
  });
});
