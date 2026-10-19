/**
 * Provider `chatgpt` over a fake OpenAI: the plan's models, a request signed with the access token,
 * and a refresh of tokens near expiry.
 */

import { expect } from "bun:test";

import { Effect, Layer, Redacted, Ref, Stream } from "effect";
import { HttpClient } from "effect/http";

import credentialStore from "@liminal/credential-store";
import { CredentialStore, OAuth } from "@liminal/credential-store/contract";
import logins from "@liminal/logins";
import models from "@liminal/models";
import { Models } from "@liminal/models/contract";
import { type ModelRequest, ThinkingEffort } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import { chatgptLogin, chatgptProvider } from "../src/contract.ts";
import { chatgptLayer } from "../src/server/chatgpt/provider.ts";
import { fakeOpenAi, goodClaims, makeKey, type Sent } from "./fake-openai.ts";
import { fakeCatalog } from "./support.ts";

const sent = Ref.makeUnsafe<ReadonlyArray<Sent>>([]);

const fakeHttp = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const key = yield* makeKey;
    const nonces = yield* Ref.make<ReadonlyArray<string>>([]);
    const answers = { scope: "", claims: goodClaims("app-1", 0), revokeStatus: 200 };

    return fakeOpenAi({ signing: key, published: key }, answers, nonces, sent);
  }),
);

const stack = Layer.unwrap(
  Effect.as(
    Ref.set(sent, []),
    chatgptLayer.pipe(
      Layer.provideMerge(fakeHttp),
      Layer.provideMerge(serverOf(logins)),
      Layer.provideMerge(serverOf(models)),
      Layer.provideMerge(fakeCatalog),
      Layer.provideMerge(serverOf(credentialStore)),
      Layer.provideMerge(testBaseServices),
    ),
  ),
);

/** Saves a login whose access token expires at `expiresAt`. */
const saveLogin = (expiresAt: number) =>
  Effect.flatMap(CredentialStore, (store) =>
    store.set(
      chatgptLogin,
      OAuth.make({
        access: Redacted.make("at-0"),
        refresh: Redacted.make("rt-0"),
        expiresAt,
        extra: { clientId: "app-1", idToken: "id-0" },
      }),
    ),
  );

const request: ModelRequest = {
  model: { provider: chatgptProvider, id: "gpt-test" },
  messages: [{ role: "user", parts: [{ type: "text", text: "Hello", providerData: {} }] }],
  tools: [],
  thinking: ThinkingEffort.make({ effort: "low" }),
  cacheKey: "session-1",
};

effectTest(
  "lists the catalog's models the plan offers, read with the access token",
  Effect.gen(function* () {
    yield* saveLogin(Number.MAX_SAFE_INTEGER);
    const listed = yield* (yield* Models).listModels(chatgptProvider);

    expect(listed.map((model) => model.id)).toEqual(["gpt-test"]);
    expect(listed[0]?.contextWindow).toBe(272_000);

    expect((yield* Ref.get(sent))[0]).toMatchObject({
      path: "/v1/models",
      headers: { authorization: "Bearer at-0" },
    });
  }),
  stack,
);

effectTest(
  "streams a reply from the API signed with the access token",
  Effect.gen(function* () {
    yield* saveLogin(Number.MAX_SAFE_INTEGER);
    const events = yield* Stream.runCollect((yield* Models).stream(request));

    expect(events.at(-1)).toMatchObject({ type: "finish", reason: "stop" });

    expect((yield* Ref.get(sent))[0]).toMatchObject({
      path: "/v1/responses",
      headers: { authorization: "Bearer at-0", "session-id": "session-1" },
    });
  }),
  stack,
);

effectTest(
  "refreshes tokens near expiry for the saved app, then signs with the new token",
  Effect.gen(function* () {
    yield* saveLogin(0);
    yield* Stream.runDrain((yield* Models).stream(request));
    const [refresh, call] = yield* Ref.get(sent);

    expect(refresh).toMatchObject({
      path: "/api/accounts/oauth/token",
      form: {
        grant_type: "refresh_token",
        refresh_token: "rt-0",
        client_id: "app-1",
        resource: "https://api.openai.com/v1",
      },
    });

    expect(call?.headers).toMatchObject({ authorization: "Bearer at-1" });
  }),
  stack,
);
