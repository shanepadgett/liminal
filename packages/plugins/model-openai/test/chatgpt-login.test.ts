/**
 * Sign in with ChatGPT over a fake flow and a fake OpenAI auth server: a first login that registers
 * Liminal, a later login with the saved app, a refused plan scope, an untrusted ID token, and
 * revoking on sign-out.
 */

import { expect } from "bun:test";

import { Effect, Exit, Layer, Option, Predicate, Redacted, Ref } from "effect";
import { HttpClient } from "effect/http";

import credentialStore from "@liminal/credential-store";
import { CredentialStore, OAuth } from "@liminal/credential-store/contract";
import {
  type BrowserAuthorization,
  LoginFlow,
  LoginMethod,
  LoginReturn,
} from "@liminal/logins/contract";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import { chatgptLogin } from "../src/contract.ts";
import { makeChatgptMethod } from "../src/server/chatgpt/login.ts";
import { type Answers, fakeOpenAi, goodClaims, makeKey, type Sent } from "./fake-openai.ts";

const stack = serverOf(credentialStore).pipe(Layer.provideMerge(testBaseServices));

/** A flow whose sign-in comes back at once, naming `clientId` when given; it keeps each nonce. */
const fakeFlow = (
  asked: Ref.Ref<ReadonlyArray<BrowserAuthorization>>,
  nonces: Ref.Ref<ReadonlyArray<string>>,
  clientId: Option.Option<string>,
) =>
  LoginFlow.of({
    openUrl: () => Effect.void,
    showCode: () => Effect.void,
    ask: () => Effect.never,
    askSecret: () => Effect.never,
    waiting: () => Effect.void,
    tell: () => Effect.void,
    authorizeInBrowser: (authorization) =>
      Ref.update(asked, (all) => [...all, authorization]).pipe(
        Effect.andThen(Ref.update(nonces, (all) => [...all, authorization.params["nonce"] ?? ""])),
        Effect.as({
          code: "c1",
          verifier: "v1",
          redirectUri: "http://127.0.0.1:1455/auth/callback",
          state: "s1",
          clientId,
        }),
      ),
  });

const planScope = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";

const answers = (overrides: Partial<Answers> = {}): Answers => ({
  scope: planScope,
  claims: goodClaims("app-1", 0),
  revokeStatus: 200,
  ...overrides,
});

/** The method over the fake, with what it sent and what the flow was asked. */
const setUp = Effect.fn("setUp")(function* (given: Answers, isForged = false) {
  const key = yield* makeKey;
  const keys = { signing: isForged ? yield* makeKey : key, published: key };
  const nonces = yield* Ref.make<ReadonlyArray<string>>([]);
  const sent = yield* Ref.make<ReadonlyArray<Sent>>([]);
  const asked = yield* Ref.make<ReadonlyArray<BrowserAuthorization>>([]);

  const method = yield* makeChatgptMethod.pipe(
    Effect.provideService(HttpClient.HttpClient, fakeOpenAi(keys, given, nonces, sent)),
  );

  if (!LoginMethod.$is("Flow")(method)) return yield* Effect.die("chatgpt is a Flow login");

  const logIn = (clientId: Option.Option<string>) =>
    Effect.exit(
      method
        .logIn("browser")
        .pipe(Effect.provideService(LoginFlow, fakeFlow(asked, nonces, clientId))),
    );

  return { method, logIn, sent, asked };
});

const saved = OAuth.make({
  access: Redacted.make("at-0"),
  refresh: Redacted.make("rt-0"),
  expiresAt: 0,
  extra: { clientId: "app-1", idToken: "id-0" },
});

effectTest(
  "a first login registers Liminal and keeps the issued app id and ID token",
  Effect.gen(function* () {
    const { logIn, sent, asked } = yield* setUp(answers());
    const credential = yield* yield* logIn(Option.some("app-1"));
    const [first] = yield* Ref.get(asked);

    expect(first).toMatchObject({
      authorizeUrl: "https://auth.openai.com/api/accounts/authorize",
      params: {
        client_id: "dynamic_agent_client",
        agent_name_hint: "Liminal",
        resource: "https://api.openai.com/v1",
        scope: planScope,
      },
      returnTo: LoginReturn.Callback({ host: "127.0.0.1", port: 1455, path: "/auth/callback" }),
    });

    expect(first?.params["ext_agent_host_id"]).toStartWith("urn:uuid:");

    expect((yield* Ref.get(sent))[0]).toMatchObject({
      path: "/api/accounts/oauth/token",
      form: {
        grant_type: "authorization_code",
        code: "c1",
        code_verifier: "v1",
        redirect_uri: "http://127.0.0.1:1455/auth/callback",
        client_id: "app-1",
        resource: "https://api.openai.com/v1",
      },
    });

    expect(Predicate.isTagged(credential, "OAuth") && credential.extra).toMatchObject({
      clientId: "app-1",
    });
  }),
  stack,
);

effectTest(
  "a later login sends the saved app id and ID token and keeps the same host id",
  Effect.gen(function* () {
    const { logIn, asked } = yield* setUp(answers());
    yield* yield* logIn(Option.some("app-1"));
    yield* (yield* CredentialStore).set(chatgptLogin, saved);
    yield* yield* logIn(Option.none());

    const [first, later] = yield* Ref.get(asked);

    expect(later?.params).toMatchObject({ client_id: "app-1", id_token_hint: "id-0" });
    expect(later?.params["agent_name_hint"]).toBeUndefined();
    expect(later?.params["ext_agent_host_id"]).toBe(first?.params["ext_agent_host_id"] ?? "");
  }),
  stack,
);

effectTest(
  "a login without plan use allowed fails",
  Effect.gen(function* () {
    const { logIn } = yield* setUp(answers({ scope: "openid profile email offline_access" }));
    const exit = yield* logIn(Option.some("app-1"));

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("ChatGPT plan");
  }),
  stack,
);

effectTest(
  "an ID token for another login's nonce or another app fails the login",
  Effect.gen(function* () {
    const otherNonce = yield* setUp(answers({ claims: () => goodClaims("app-1", 0)("other") }));
    const nonceExit = yield* otherNonce.logIn(Option.some("app-1"));
    expect(Exit.isFailure(nonceExit) && JSON.stringify(nonceExit.cause)).toContain("another login");

    const otherApp = yield* setUp(answers({ claims: goodClaims("app-2", 0) }));
    const appExit = yield* otherApp.logIn(Option.some("app-1"));
    expect(Exit.isFailure(appExit) && JSON.stringify(appExit.cause)).toContain("another app");
  }),
  stack,
);

effectTest(
  "an ID token no published key signed fails the login",
  Effect.gen(function* () {
    const { logIn } = yield* setUp(answers(), true);
    const exit = yield* logIn(Option.some("app-1"));

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("does not match");
  }),
  stack,
);

effectTest(
  "a first login whose reply names no app id fails",
  Effect.gen(function* () {
    const { logIn } = yield* setUp(answers());
    const exit = yield* logIn(Option.none());

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("no app id");
  }),
  stack,
);

effectTest(
  "signing out revokes the refresh token; a refused revoke says how to disconnect",
  Effect.gen(function* () {
    yield* (yield* CredentialStore).set(chatgptLogin, saved);
    const accepted = yield* setUp(answers());
    yield* Option.getOrThrow(accepted.method.logOut);

    expect((yield* Ref.get(accepted.sent))[0]).toMatchObject({
      path: "/api/accounts/oauth/revoke",
      form: { token: "rt-0", token_type_hint: "refresh_token", client_id: "app-1" },
    });

    const refused = yield* setUp(answers({ revokeStatus: 400 }));
    const exit = yield* Effect.exit(Option.getOrThrow(refused.method.logOut));
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("ChatGPT settings");
  }),
  stack,
);
