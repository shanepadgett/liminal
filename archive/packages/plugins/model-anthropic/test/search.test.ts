/**
 * Anthropic's web searchers over a stub HTTP client: a search sends the search tool, required, and
 * reads the answer and its sources from the reply.
 */

import { expect } from "bun:test";

import { ConfigProvider, Effect, Layer, Option, Ref, Schema } from "effect";
import { HttpClient } from "effect/http";

import credentialStore from "@liminal/credential-store";
import logins from "@liminal/logins";
import { ModelCatalog } from "@liminal/model-catalog/contract";
import models from "@liminal/models";
import { Registry } from "@liminal/sdk";
import { effectTest, type Sent, serverOf, stubHttp, testBaseServices } from "@liminal/sdk/testing";
import { WebSearchers } from "@liminal/tools-web/contract";

import { anthropicLayer } from "../src/server/provider.ts";

const result = { url: "https://effect.website/", title: "Effect" };

const message = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  content: [
    { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "effect" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_1",
      content: [{ type: "web_search_result", ...result, encrypted_content: "e", page_age: null }],
    },
    { type: "text", text: "Effect is a TypeScript library.", citations: null },
  ],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: null,
    server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
    service_tier: null,
  },
};

const sent = Ref.makeUnsafe<ReadonlyArray<Sent>>([]);

const stub = Layer.succeed(
  HttpClient.HttpClient,
  stubHttp(sent, (url) =>
    url.host === "registry.npmjs.org"
      ? Response.json({ version: "2.1.0" })
      : Response.json(message),
  ),
);

const stack = anthropicLayer.pipe(
  Layer.provideMerge(stub),
  Layer.provideMerge(Registry.layer(WebSearchers)),
  Layer.provideMerge(serverOf(logins)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(
    Layer.succeed(ModelCatalog, ModelCatalog.of({ models: () => Effect.succeed([]) })),
  ),
  Layer.provideMerge(serverOf(credentialStore)),
  Layer.provideMerge(testBaseServices),
);

const Body = Schema.Struct({
  model: Schema.String,
  tools: Schema.Array(Schema.Struct({ type: Schema.String })),
  tool_choice: Schema.Struct({ type: Schema.String }),
});

effectTest(
  "the API key searcher sends the search tool and reads the answer and its sources",
  Effect.gen(function* () {
    const searchers = yield* (yield* WebSearchers).list;
    expect(searchers.map((searcher) => searcher.name)).toEqual(["Claude", "Anthropic"]);

    const api = Option.getOrThrow(Option.fromUndefinedOr(searchers[1]));
    const answer = yield* api.search({ query: "effect", maxSources: 5 });

    expect(answer).toEqual({ text: "Effect is a TypeScript library.", sources: [result] });

    const request = (yield* Ref.get(sent)).find((each) => each.url.pathname === "/v1/messages");
    const body = yield* Schema.decodeUnknownEffect(Body)(request?.body);

    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.tools.map((tool) => tool.type)).toEqual(["web_search_20250305"]);
    expect(body.tool_choice.type).toBe("any");
  }).pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ env: { ANTHROPIC_API_KEY: "sk-ant-env" } }),
    ),
    Effect.scoped,
  ),
  stack,
);

effectTest(
  "the subscription searcher fails without a Claude login",
  Effect.gen(function* () {
    const [claude] = yield* (yield* WebSearchers).list;

    const failure = yield* Effect.flip(
      Option.getOrThrow(Option.fromUndefinedOr(claude)).search({ query: "x", maxSources: 1 }),
    );

    expect(failure.message).toContain("Claude");
  }),
  stack,
);
