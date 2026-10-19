/**
 * Provider `openai` over a stub HTTP client: its login, the key it signs with, and a streamed
 * reply. The reply is a hand-written Responses stream, as no OpenAI key was at hand to record one.
 */

import { expect } from "bun:test";

import { ConfigProvider, Effect, Exit, Layer, Option, Redacted, Ref, Stream } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import credentialStore from "@liminal/credential-store";
import { ApiKey, CredentialStore } from "@liminal/credential-store/contract";
import logins from "@liminal/logins";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import models from "@liminal/models";
import { Models } from "@liminal/models/contract";
import { ModelError, type ModelInfo, type ModelRequest, ThinkingEffort } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import { openAiLogin, openAiProvider } from "../src/contract.ts";
import { openAiLayer } from "../src/server/provider.ts";
import { fakeCatalog, replyStream } from "./support.ts";

const headers = Ref.makeUnsafe<ReadonlyArray<Readonly<Record<string, string>>>>([]);

/** Answers every request with the reply, keeping its headers. */
const stubHttp = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.as(
      Ref.update(headers, (all) => [...all, request.headers]),
      HttpClientResponse.fromWeb(
        request,
        new Response(replyStream, { headers: { "content-type": "text/event-stream" } }),
      ),
    ),
  ),
);

const stack = Layer.unwrap(
  Effect.as(
    Ref.set(headers, []),
    openAiLayer.pipe(
      Layer.provideMerge(stubHttp),
      Layer.provideMerge(serverOf(logins)),
      Layer.provideMerge(serverOf(models)),
      Layer.provideMerge(fakeCatalog),
      Layer.provideMerge(serverOf(credentialStore)),
      Layer.provideMerge(testBaseServices),
    ),
  ),
);

/** The environment with `OPENAI_API_KEY` set. */
const withKey = ConfigProvider.fromEnv({ env: { OPENAI_API_KEY: "sk-env" } });

/** The environment with no key, whatever the machine running the tests has. */
const noKey = ConfigProvider.fromEnv({ env: {} });

const request: ModelRequest = {
  model: { provider: openAiProvider, id: "gpt-test" },
  messages: [{ role: "user", parts: [{ type: "text", text: "Hello", providerData: {} }] }],
  tools: [],
  thinking: ThinkingEffort.make({ effort: "low" }),
  cacheKey: "session-1",
};

effectTest(
  "registers the OpenAI API key login",
  Effect.gen(function* () {
    const method = yield* (yield* LoginMethods).get(openAiLogin);

    expect(Option.getOrThrow(method)).toEqual(
      LoginMethod.ApiKey({
        id: "openai",
        vendor: { id: "openai", name: "OpenAI" },
        title: "API key",
        env: "OPENAI_API_KEY",
      }),
    );
  }),
  stack,
);

effectTest(
  "streams a reply signed with the saved key",
  Effect.gen(function* () {
    yield* (yield* CredentialStore).set(
      openAiLogin,
      ApiKey.make({ key: Redacted.make("sk-saved") }),
    );

    const events = yield* Stream.runCollect((yield* Models).stream(request));

    expect(events.map((each) => each.type)).toContain("finish");
    expect(events.at(-1)).toMatchObject({ type: "finish", reason: "stop" });

    expect((yield* Ref.get(headers))[0]).toMatchObject({
      authorization: "Bearer sk-saved",
      "session-id": "session-1",
    });
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "signs with OPENAI_API_KEY while no key is saved",
  Effect.gen(function* () {
    yield* Stream.runDrain((yield* Models).stream(request));
    expect((yield* Ref.get(headers))[0]).toMatchObject({ authorization: "Bearer sk-env" });
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "fails as an auth error with no key, sending nothing",
  Effect.gen(function* () {
    const exit = yield* Effect.exit(Stream.runDrain((yield* Models).stream(request)));

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("auth");
    expect(yield* Ref.get(headers)).toEqual([]);
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, noKey)),
  stack,
);

effectTest(
  "lists the catalog's OpenAI models only while a key is set",
  Effect.gen(function* () {
    const service = yield* Models;
    const before = yield* Effect.flip(service.listModels(openAiProvider));
    expect(before).toBeInstanceOf(ModelError);
    expect(before).toMatchObject({ reason: "auth" });

    yield* (yield* CredentialStore).set(
      openAiLogin,
      ApiKey.make({ key: Redacted.make("sk-saved") }),
    );

    const listed: ReadonlyArray<ModelInfo> = yield* service.listModels(openAiProvider);
    expect(listed.map((model) => model.id)).toEqual(["gpt-test"]);
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, noKey)),
  stack,
);
