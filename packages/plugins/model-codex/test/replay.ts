/** An HTTP client that answers from recordings and keeps every request it receives. */

import { join } from "node:path";

import { Effect, Layer, Predicate, Ref, Schema } from "effect";
import { HttpClient, type HttpClientRequest, HttpClientResponse, UrlParams } from "effect/http";

export interface SentRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const InputItem = Schema.Struct({
  type: Schema.optionalKey(Schema.String),
  role: Schema.optionalKey(Schema.String),
  id: Schema.optionalKey(Schema.String),
  encrypted_content: Schema.optionalKey(Schema.String),
  output: Schema.optionalKey(Schema.String),
});

/** The fields of a sent Responses request the tests check. */
const SentBody = Schema.fromJsonString(
  Schema.Struct({
    model: Schema.String,
    stream: Schema.Boolean,
    store: Schema.Boolean,
    include: Schema.Array(Schema.String),
    prompt_cache_key: Schema.String,
    reasoning: Schema.Struct({ effort: Schema.String, summary: Schema.String }),
    tools: Schema.Array(Schema.Struct({ type: Schema.String, name: Schema.String })),
    input: Schema.Array(InputItem),
  }),
);

/** The body of the `index`th sent request, read as a Responses request. */
export const sentBody = (sent: Ref.Ref<ReadonlyArray<SentRequest>>, index: number) =>
  Effect.flatMap(Ref.get(sent), (all) =>
    Schema.decodeEffect(SentBody)(all[index]?.body ?? ""),
  ).pipe(Effect.orDie);

/** A canned answer: a fixture file's body, or literal text, with a status. */
export interface Answer {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly fixture?: string;
  readonly text?: string;
}

/** Answers queued by the last part of a request's path. */
export type Answers = Readonly<Record<string, ReadonlyArray<Answer>>>;

const fixtures = join(import.meta.dir, "fixtures");

const bodyText = (body: { readonly _tag: string }) =>
  Predicate.isTagged(body, "Uint8Array") && "body" in body && body.body instanceof Uint8Array
    ? new TextDecoder().decode(body.body)
    : "";

/** The request's URL with its query. */
const urlOf = (request: HttpClientRequest.HttpClientRequest) => {
  const query = UrlParams.toString(request.urlParams);

  return query === "" ? request.url : `${request.url}?${query}`;
};

/**
 * Answers each request with the next answer queued for the last part of its path, and records it in
 * `sent`.
 */
export const replay = (answers: Answers, sent: Ref.Ref<ReadonlyArray<SentRequest>>) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const queues = yield* Ref.make<Answers>(answers);

      return HttpClient.make((request) =>
        Effect.gen(function* () {
          const name = new URL(request.url).pathname.split("/").at(-1) ?? "";

          yield* Ref.update(sent, (all) => [
            ...all,
            { url: urlOf(request), headers: request.headers, body: bodyText(request.body) },
          ]);

          const answer = yield* Ref.modify(
            queues,
            (all: Answers): readonly [Answer | undefined, Answers] => {
              const [next, ...rest] = all[name] ?? [];

              return [next, { ...all, [name]: rest }];
            },
          );

          if (answer === undefined)
            return yield* Effect.die(`no recorded answer for ${request.url}`);

          const text =
            answer.fixture === undefined
              ? (answer.text ?? "")
              : yield* Effect.promise(() => Bun.file(join(fixtures, answer.fixture ?? "")).text());

          return HttpClientResponse.fromWeb(
            request,
            new Response(text, { status: answer.status ?? 200, headers: answer.headers ?? {} }),
          );
        }),
      );
    }),
  );
