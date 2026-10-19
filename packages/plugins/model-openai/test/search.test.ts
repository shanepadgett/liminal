/**
 * OpenAI's web searcher over a stub HTTP client: a search sends the search tool, required, at low
 * effort, and reads the answer and the pages the search opened.
 */

import { expect } from "bun:test";

import { ConfigProvider, Effect, Layer, Option, Ref, Schema } from "effect";
import { HttpClient } from "effect/http";

import credentialStore from "@liminal/credential-store";
import logins from "@liminal/logins";
import models from "@liminal/models";
import { Registry } from "@liminal/sdk";
import { effectTest, type Sent, serverOf, stubHttp, testBaseServices } from "@liminal/sdk/testing";
import { WebSearchers } from "@liminal/tools-web/contract";

import { openAiLayer } from "../src/server/provider.ts";
import { fakeCatalog } from "./support.ts";

const reply = {
  id: "resp_1",
  object: "response",
  created_at: 1,
  model: "gpt-6-luna",
  status: "completed",
  output: [
    {
      type: "web_search_call",
      id: "ws_1",
      status: "completed",
      action: {
        type: "search",
        query: "effect",
        sources: [{ type: "url", url: "https://effect.website/" }],
      },
    },
    {
      type: "message",
      id: "msg_1",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "Effect is a TypeScript library.", annotations: [] }],
    },
  ],
  usage: {
    input_tokens: 10,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 2,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 12,
  },
};

const sent = Ref.makeUnsafe<ReadonlyArray<Sent>>([]);

const stack = openAiLayer.pipe(
  Layer.provideMerge(
    Layer.succeed(
      HttpClient.HttpClient,
      stubHttp(sent, () => Response.json(reply)),
    ),
  ),
  Layer.provideMerge(Registry.layer(WebSearchers)),
  Layer.provideMerge(serverOf(logins)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(fakeCatalog),
  Layer.provideMerge(serverOf(credentialStore)),
  Layer.provideMerge(testBaseServices),
);

const Body = Schema.Struct({
  model: Schema.String,
  tools: Schema.Array(Schema.Struct({ type: Schema.String })),
  tool_choice: Schema.String,
  reasoning: Schema.Struct({ effort: Schema.String }),
});

effectTest(
  "the searcher sends the search tool and reads the answer and the pages it opened",
  Effect.gen(function* () {
    const [searcher] = yield* (yield* WebSearchers).list;
    const openAi = Option.getOrThrow(Option.fromUndefinedOr(searcher));
    expect(openAi.name).toBe("OpenAI");

    const answer = yield* openAi.search({ query: "effect", maxSources: 5 });

    expect(answer).toEqual({
      text: "Effect is a TypeScript library.",
      sources: [{ url: "https://effect.website/", title: "effect.website" }],
    });

    const [request] = yield* Ref.get(sent);
    const body = yield* Schema.decodeUnknownEffect(Body)(request?.body);

    expect(body).toEqual({
      model: "gpt-6-luna",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      reasoning: { effort: "low" },
    });
  }).pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ env: { OPENAI_API_KEY: "sk-env" } }),
    ),
    Effect.scoped,
  ),
  stack,
);
