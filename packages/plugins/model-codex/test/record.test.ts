/**
 * Records the fixtures the replay tests use, against the live backend. Runs only with
 * `LIMINAL_LIVE=1` and a Codex login in Tau's credential store that stays valid for 10 minutes; it
 * never refreshes that login.
 */

import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { Effect, FileSystem, Layer, Ref, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";

import { Models } from "@liminal/models/contract";
import { ThinkingEffort } from "@liminal/sdk";
import { effectTest } from "@liminal/sdk/testing";

import { codexProvider } from "../src/contract.ts";
import {
  codexStack,
  finishedParts,
  firstMessages,
  oauth,
  readTool,
  secondMessages,
} from "./support.ts";

const fixtures = join(import.meta.dir, "fixtures");
const model = { provider: codexProvider, id: "gpt-5.6-luna" };

/** The two fields of Tau's login record this test reads. */
const TauLogin = Schema.fromJsonString(
  Schema.Struct({ access: Schema.String, expiresAt: Schema.Finite }),
);

/** Tau's Codex login, if it stays valid long enough that nothing refreshes it. */
const tauLogin = () => {
  const db = new Database(join(homedir(), ".tau", "credentials.db"), { readonly: true });

  const row = db
    .query<{ credential: string }, []>("select credential from credential where provider = 'codex'")
    .get();

  db.close();
  const login = row === null ? undefined : Schema.decodeSync(TauLogin)(row.credential);

  return login !== undefined && login.expiresAt > Date.now() + 10 * 60_000
    ? oauth(login.access, login.expiresAt)
    : undefined;
};

/** Fetch, keeping each response body under the last part of its path. */
const recording = (bodies: Ref.Ref<ReadonlyArray<readonly [string, string]>>) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      return HttpClient.transformResponse(client, (effect) =>
        Effect.flatMap(effect, (response) =>
          Effect.gen(function* () {
            const text = yield* response.text;
            const name = new URL(response.request.url).pathname.split("/").at(-1) ?? "";
            yield* Ref.update(bodies, (all) => [...all, [name, text] as const]);

            return HttpClientResponse.fromWeb(
              response.request,
              new Response(text, { status: response.status, headers: response.headers }),
            );
          }),
        ),
      );
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));

/** The list with only the fields the provider reads; decoding drops the large prompt text. */
const ModelFields = Schema.fromJsonString(
  Schema.Struct({
    models: Schema.Array(
      Schema.Struct({
        slug: Schema.String,
        context_window: Schema.Finite,
        visibility: Schema.String,
      }),
    ),
  }),
);

const modelFields = (body: string) =>
  `${JSON.stringify(Schema.decodeSync(ModelFields)(body), null, 2)}\n`;

/** The stream without the account's safety identifier. */
const anonymous = (body: string) =>
  body.replaceAll(/"safety_identifier":"[^"]*"/g, '"safety_identifier":"recorded"');

const login = process.env.LIMINAL_LIVE === "1" ? tauLogin() : undefined;

if (login === undefined) {
  test.skip("records the Codex fixtures (needs LIMINAL_LIVE=1 and a valid Tau login)", () => {});
} else {
  const bodies = Ref.makeUnsafe<ReadonlyArray<readonly [string, string]>>([]);

  effectTest(
    "records the model list, a tool call and the reply that uses its result",
    TestClock.withLive(
      Effect.gen(function* () {
        const models = yield* Models;
        const listed = yield* models.listModels(codexProvider);
        expect(listed.some((info) => info.id === model.id)).toBe(true);

        const ask = (messages: typeof firstMessages) =>
          Stream.runCollect(
            models.stream({
              model,
              messages,
              tools: [readTool],
              thinking: ThinkingEffort.make({ effort: "high" }),
              cacheKey: "liminal-record",
            }),
          );

        const first = finishedParts(yield* ask(firstMessages));
        expect(first.some((part) => part.type === "tool-call")).toBe(true);

        const second = finishedParts(yield* ask(secondMessages(first)));
        expect(second.some((part) => part.type === "text")).toBe(true);

        const fs = yield* FileSystem.FileSystem;
        const [list, call, answer] = yield* Ref.get(bodies);
        yield* fs.writeFileString(join(fixtures, "models.json"), modelFields(list?.[1] ?? ""));
        yield* fs.writeFileString(join(fixtures, "tool-call.sse"), anonymous(call?.[1] ?? ""));
        yield* fs.writeFileString(join(fixtures, "reply.sse"), anonymous(answer?.[1] ?? ""));
      }),
    ),
    codexStack(recording(bodies), login),
  );
}
