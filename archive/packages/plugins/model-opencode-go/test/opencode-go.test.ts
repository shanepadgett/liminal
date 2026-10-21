/**
 * Provider `opencode-go` over a stub HTTP client: its login, which models it lists, and each
 * protocol's address, headers and streamed reply. The replies are hand-written, shaped as OpenCode
 * sends them, as recording them would spend a subscription's quota.
 */

import { expect } from "bun:test";

import { ConfigProvider, Effect, Exit, Layer, Option, Ref, Stream } from "effect";
import { HttpClient } from "effect/http";

import credentialStore from "@liminal/credential-store";
import logins from "@liminal/logins";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelCatalog } from "@liminal/model-catalog/contract";
import models from "@liminal/models";
import { Models } from "@liminal/models/contract";
import { type ModelRequest, ThinkingEffort } from "@liminal/sdk";
import {
  dataEvent,
  effectTest,
  event,
  eventStream,
  type Sent,
  serverOf,
  stubHttp,
  testBaseServices,
} from "@liminal/sdk/testing";

import { openCodeGoLogin, openCodeGoProvider } from "../src/contract.ts";
import { openCodeGoLayer } from "../src/server/provider.ts";

/** A Chat Completions reply saying "Hi". */
const chatEvents = [
  dataEvent({
    id: "c-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "glm-test",
    choices: [{ index: 0, delta: { role: "assistant", content: "Hi" }, finish_reason: null }],
  }),
  dataEvent({
    id: "c-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "glm-test",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
  }),
  "data: [DONE]\n\n",
];

/** A Messages reply saying "Hi", without the null fields Anthropic sends and OpenCode leaves out. */
const messagesEvents = [
  event("message_start", {
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-test",
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  }),
  event("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  event("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hi" } }),
  event("content_block_stop", { index: 0 }),
  event("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }),
  event("message_stop", {}),
];

const said = {
  type: "message",
  id: "msg_1",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text: "Hi", annotations: [] }],
};

/** A Responses reply saying "Hi". */
const responsesEvents = [
  event("response.output_item.done", { sequence_number: 0, output_index: 0, item: said }),
  event("response.completed", {
    sequence_number: 1,
    response: {
      id: "resp_1",
      object: "response",
      created_at: 1,
      model: "gpt-test",
      status: "completed",
      output: [said],
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 12,
      },
    },
  }),
];

const replies: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ["/inference/go/v1/chat/completions", chatEvents],
  ["/inference/go/v1/messages", messagesEvents],
  ["/inference/go/v1/responses", responsesEvents],
]);

const sent = Ref.makeUnsafe<ReadonlyArray<Sent>>([]);

const stub = Layer.succeed(
  HttpClient.HttpClient,
  stubHttp(sent, (url) => eventStream(replies.get(url.pathname) ?? [])),
);

const model = (id: string, pkg: Option.Option<string>) => ({
  info: {
    id,
    name: id,
    contextWindow: 200_000,
    maxOutput: 64_000,
    thinking: [],
    input: ["text" as const],
  },
  package: pkg,
});

const fakeCatalog = Layer.succeed(
  ModelCatalog,
  ModelCatalog.of({
    models: () =>
      Effect.succeed([
        model("glm-test", Option.none()),
        model("claude-test", Option.some("@ai-sdk/anthropic")),
        model("gpt-test", Option.some("@ai-sdk/openai")),
        model("gemini-test", Option.some("@ai-sdk/google")),
      ]),
  }),
);

const stack = Layer.unwrap(
  Effect.as(
    Ref.set(sent, []),
    openCodeGoLayer.pipe(
      Layer.provideMerge(stub),
      Layer.provideMerge(serverOf(logins)),
      Layer.provideMerge(serverOf(models)),
      Layer.provideMerge(fakeCatalog),
      Layer.provideMerge(serverOf(credentialStore)),
      Layer.provideMerge(testBaseServices),
    ),
  ),
);

const withKey = ConfigProvider.fromEnv({ env: { OPENCODE_API_KEY: "sk-oc-env" } });
const noKey = ConfigProvider.fromEnv({ env: {} });

const requestTo = (id: string): ModelRequest => ({
  model: { provider: openCodeGoProvider, id },
  messages: [{ role: "user", parts: [{ type: "text", text: "Hello", providerData: {} }] }],
  tools: [],
  thinking: ThinkingEffort.make({ effort: "high" }),
  cacheKey: "session-1",
});

/** Streams a reply from model `id`, returning its last event and the request sent. */
const replyFrom = (id: string) =>
  Effect.gen(function* () {
    yield* Ref.set(sent, []);

    const events = yield* Stream.runCollect((yield* Models).stream(requestTo(id)));
    const [request] = yield* Ref.get(sent);

    return { last: events.at(-1), request };
  });

effectTest(
  "registers the OpenCode Go API key login",
  Effect.gen(function* () {
    const method = yield* (yield* LoginMethods).get(openCodeGoLogin);

    expect(Option.getOrThrow(method)).toEqual(
      LoginMethod.ApiKey({
        id: "opencode-go",
        vendor: { id: "opencode-go", name: "OpenCode Go" },
        title: "API key",
        env: "OPENCODE_API_KEY",
      }),
    );
  }),
  stack,
);

effectTest(
  "lists only the models on a protocol it calls",
  Effect.gen(function* () {
    const listed = yield* (yield* Models).listModels(openCodeGoProvider);

    expect(listed.map((each) => each.id)).toEqual(["glm-test", "claude-test", "gpt-test"]);
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "calls a model with no package on Chat Completions, naming the session",
  Effect.gen(function* () {
    const { last, request } = yield* replyFrom("glm-test");

    expect(last).toMatchObject({ type: "finish", reason: "stop" });
    expect(request?.url.href).toBe("https://opencode.ai/inference/go/v1/chat/completions");

    expect(request?.headers).toMatchObject({
      authorization: "Bearer sk-oc-env",
      "x-opencode-client": "liminal",
      "x-opencode-session": "session-1",
    });

    expect(request?.body).toMatchObject({ reasoning_effort: "high" });
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "calls an Anthropic package model on Messages, filling the fields OpenCode leaves out",
  Effect.gen(function* () {
    const { last, request } = yield* replyFrom("claude-test");

    expect(last).toMatchObject({ type: "finish", reason: "stop" });
    expect(request?.url.pathname).toBe("/inference/go/v1/messages");

    expect(request?.headers).toMatchObject({
      "x-api-key": "sk-oc-env",
      "x-opencode-session": "session-1",
    });
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "calls an OpenAI package model on Responses",
  Effect.gen(function* () {
    const { last, request } = yield* replyFrom("gpt-test");

    expect(last).toMatchObject({ type: "finish", reason: "stop" });
    expect(request?.url.href).toBe("https://opencode.ai/inference/go/v1/responses");
    expect(request?.headers).toMatchObject({ authorization: "Bearer sk-oc-env" });
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "fails a model on another protocol as an invalid request, sending nothing",
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      Stream.runDrain((yield* Models).stream(requestTo("gemini-test"))),
    );

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("invalid-request");
    expect(yield* Ref.get(sent)).toEqual([]);
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "fails as an auth error with no key, sending nothing",
  Effect.gen(function* () {
    const exit = yield* Effect.exit(Stream.runDrain((yield* Models).stream(requestTo("glm-test"))));

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("auth");
    expect(yield* Ref.get(sent)).toEqual([]);
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, noKey)),
  stack,
);
