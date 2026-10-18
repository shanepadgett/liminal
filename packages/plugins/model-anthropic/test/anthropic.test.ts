/**
 * Providers `anthropic` and `anthropic-api` over a stub HTTP client: their logins, how each signs,
 * the cache marks and thinking fields sent, and a streamed reply. The reply is a hand-written
 * Messages stream, as recording one would spend a subscription's or a key's quota.
 */

import { expect } from "bun:test";

import { ConfigProvider, Effect, Exit, Layer, Option, Redacted, Ref, Schema, Stream } from "effect";
import { HttpClient } from "effect/http";

import credentialStore from "@liminal/credential-store";
import { CredentialStore, OAuth } from "@liminal/credential-store/contract";
import logins from "@liminal/logins";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelCatalog } from "@liminal/model-catalog/contract";
import models from "@liminal/models";
import { Models } from "@liminal/models/contract";
import { type ModelContent, type ModelRequest, ThinkingBudget, ThinkingEffort } from "@liminal/sdk";
import {
  effectTest,
  event,
  eventStream,
  type Sent,
  serverOf,
  stubHttp,
  testBaseServices,
} from "@liminal/sdk/testing";

import { anthropicApiProvider, claudeProvider } from "../src/contract.ts";
import { anthropicLayer } from "../src/server/provider.ts";

const usage = {
  input_tokens: 10,
  output_tokens: 2,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

/** A reply that thinks, signs the thinking, then says "Hi". */
const replyEvents = [
  event("message_start", {
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-test",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { ...usage, cache_creation: null, service_tier: null },
    },
  }),
  event("content_block_start", {
    index: 0,
    content_block: { type: "thinking", thinking: "", signature: "" },
  }),
  event("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "Hm." } }),
  event("content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "sig" } }),
  event("content_block_stop", { index: 0 }),
  event("content_block_start", { index: 1, content_block: { type: "text", text: "" } }),
  event("content_block_delta", { index: 1, delta: { type: "text_delta", text: "Hi" } }),
  event("content_block_stop", { index: 1 }),
  event("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage }),
  event("message_stop", {}),
];

const sent = Ref.makeUnsafe<ReadonlyArray<Sent>>([]);

const stub = Layer.succeed(
  HttpClient.HttpClient,
  stubHttp(sent, (url) =>
    url.host === "registry.npmjs.org"
      ? Response.json({ version: "2.1.0" })
      : eventStream(replyEvents),
  ),
);

const fakeCatalog = Layer.succeed(
  ModelCatalog,
  ModelCatalog.of({
    models: () =>
      Effect.succeed([
        {
          info: {
            id: "claude-test",
            name: "Claude Test",
            contextWindow: 200_000,
            maxOutput: 64_000,
            thinking: [],
            input: ["text"],
          },
          package: Option.none(),
        },
      ]),
  }),
);

const stack = Layer.unwrap(
  Effect.as(
    Ref.set(sent, []),
    anthropicLayer.pipe(
      Layer.provideMerge(stub),
      Layer.provideMerge(serverOf(logins)),
      Layer.provideMerge(serverOf(models)),
      Layer.provideMerge(fakeCatalog),
      Layer.provideMerge(serverOf(credentialStore)),
      Layer.provideMerge(testBaseServices),
    ),
  ),
);

const withKey = ConfigProvider.fromEnv({ env: { ANTHROPIC_API_KEY: "sk-ant-env" } });
const noKey = ConfigProvider.fromEnv({ env: {} });

const text = (said: string) => ({ type: "text" as const, text: said, providerData: {} });

const messages: ReadonlyArray<ModelContent> = [
  { role: "system", parts: [text("Be brief.")], cache: "breakpoint" },
  { role: "user", parts: [text("Hello")], cache: "breakpoint" },
];

const requestTo = (provider: string): ModelRequest => ({
  model: { provider, id: "claude-test" },
  messages,
  tools: [],
  thinking: ThinkingEffort.make({ effort: "high" }),
});

const saveClaudeLogin = Effect.flatMap(CredentialStore, (store) =>
  store.set(
    claudeProvider,
    OAuth.make({
      access: Redacted.make("at-1"),
      refresh: Redacted.make("rt-1"),
      expiresAt: 3_600_000,
      extra: {},
    }),
  ),
);

/** The Messages requests sent, leaving out version reads. */
const messageRequests = Effect.map(Ref.get(sent), (all) =>
  all.filter((each) => each.url.pathname === "/v1/messages"),
);

const Body = Schema.Struct({
  system: Schema.Array(
    Schema.Struct({ text: Schema.String, cache_control: Schema.optional(Schema.Json) }),
  ),
  messages: Schema.Array(
    Schema.Struct({ role: Schema.String, content: Schema.Array(Schema.Json) }),
  ),
  thinking: Schema.Json,
  output_config: Schema.optional(Schema.Json),
  max_tokens: Schema.Finite,
});

const firstBody = Effect.flatMap(messageRequests, (all) =>
  Schema.decodeUnknownEffect(Body)(all[0]?.body),
);

effectTest(
  "registers the Claude subscription and API key logins",
  Effect.gen(function* () {
    const methods = yield* LoginMethods;
    const claude = Option.getOrThrow(yield* methods.get(claudeProvider));
    const api = Option.getOrThrow(yield* methods.get(anthropicApiProvider));

    expect(LoginMethod.$is("Flow")(claude) && claude.title).toBe("Claude subscription");
    expect(LoginMethod.$is("ApiKey")(api) && api.env).toBe("ANTHROPIC_API_KEY");
  }),
  stack,
);

effectTest(
  "signs a subscription request as Claude Code and keeps the thinking's signature",
  Effect.gen(function* () {
    yield* saveClaudeLogin;
    const events = yield* Stream.runCollect((yield* Models).stream(requestTo(claudeProvider)));
    const [request] = yield* messageRequests;

    expect(request?.headers).toMatchObject({
      authorization: "Bearer at-1",
      "user-agent": "claude-cli/2.1.0",
      "x-app": "cli",
    });

    expect(request?.headers["anthropic-beta"]).toContain("claude-code-20250219,oauth-2025-04-20");
    expect(request?.headers["x-api-key"]).toBeUndefined();

    expect(events).toContainEqual({
      type: "part-end",
      index: 0,
      part: {
        type: "reasoning",
        text: "Hm.",
        providerData: { anthropic: { info: { type: "thinking", signature: "sig" } } },
      },
    });

    expect(events.at(-1)).toMatchObject({ type: "finish", reason: "stop" });
  }),
  stack,
);

effectTest(
  "names Claude Code first and marks the cached blocks",
  Effect.gen(function* () {
    yield* saveClaudeLogin;
    yield* Stream.runDrain((yield* Models).stream(requestTo(claudeProvider)));
    const body = yield* firstBody;

    expect(body.system.map((block) => block.text)).toEqual([
      "You are Claude Code, Anthropic's official CLI for Claude.",
      "Be brief.",
    ]);

    expect(body.system.map((block) => block.cache_control)).toEqual([null, { type: "ephemeral" }]);

    expect(body.messages.at(-1)?.content.at(-1)).toMatchObject({
      cache_control: { type: "ephemeral" },
    });
  }),
  stack,
);

effectTest(
  "sends an effort as adaptive thinking and a budget with the output limit",
  Effect.gen(function* () {
    yield* saveClaudeLogin;
    const service = yield* Models;
    yield* Stream.runDrain(service.stream(requestTo(claudeProvider)));

    yield* Stream.runDrain(
      service.stream({
        ...requestTo(claudeProvider),
        thinking: ThinkingBudget.make({ tokens: 4096 }),
        maxOutputTokens: 8192,
      }),
    );

    const [effort, budget] = yield* Effect.flatMap(messageRequests, (all) =>
      Effect.forEach(all, (each) => Schema.decodeUnknownEffect(Body)(each.body)),
    );

    expect(effort).toMatchObject({
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
    });

    expect(budget).toMatchObject({
      thinking: { type: "enabled", budget_tokens: 4096 },
      max_tokens: 8192,
    });
  }),
  stack,
);

effectTest(
  "sends kept thinking back with its signature",
  Effect.gen(function* () {
    yield* saveClaudeLogin;

    const thought: ModelContent = {
      role: "assistant",
      parts: [
        {
          type: "reasoning",
          text: "Hm.",
          providerData: { anthropic: { info: { type: "thinking", signature: "sig" } } },
        },
        text("Hi"),
      ],
    };

    yield* Stream.runDrain(
      (yield* Models).stream({
        ...requestTo(claudeProvider),
        messages: [...messages, thought, { role: "user", parts: [text("Again")] }],
      }),
    );

    const body = yield* firstBody;

    expect(body.messages[1]?.content[0]).toEqual({
      type: "thinking",
      thinking: "Hm.",
      signature: "sig",
    });
  }),
  stack,
);

effectTest(
  "signs an API key request with the key alone",
  Effect.gen(function* () {
    yield* Stream.runDrain((yield* Models).stream(requestTo(anthropicApiProvider)));
    const [request] = yield* messageRequests;
    const body = yield* firstBody;

    expect(request?.headers["x-api-key"]).toBe("sk-ant-env");
    expect(request?.headers["authorization"]).toBeUndefined();
    expect(request?.headers["x-app"]).toBeUndefined();
    expect(body.system.map((block) => block.text)).toEqual(["Be brief."]);
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "fails as an auth error with no login, sending nothing",
  Effect.gen(function* () {
    const service = yield* Models;
    const claude = yield* Effect.exit(Stream.runDrain(service.stream(requestTo(claudeProvider))));

    const api = yield* Effect.exit(
      Stream.runDrain(service.stream(requestTo(anthropicApiProvider))),
    );

    expect(Exit.isFailure(claude) && JSON.stringify(claude.cause)).toContain("auth");
    expect(Exit.isFailure(api) && JSON.stringify(api.cause)).toContain("auth");
    expect(yield* messageRequests).toEqual([]);
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, noKey)),
  stack,
);
