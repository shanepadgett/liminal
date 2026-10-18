/** The Claude subscription login over a fake flow and token endpoint: both ways, and a refusal. */

import { expect } from "bun:test";

import { Effect, Exit, Layer, Option, Predicate, Redacted, Ref } from "effect";

import {
  type Authorized,
  type BrowserAuthorization,
  LoginFlow,
  LoginMethod,
  LoginReturn,
} from "@liminal/logins/contract";
import { effectTest } from "@liminal/sdk/testing";

import { claudeMethod } from "../src/server/login.ts";
import { type Sent, stubHttp } from "./support.ts";

/** Where the sign-in returns to, as the fake flow sends it back. */
const redirectOf = LoginReturn.$match({
  Callback: (callback) => `http://${callback.host}:${callback.port}${callback.path}`,
  Page: (page) => page.redirectUri,
});

/** A flow whose sign-in comes back with code `c1` and state `s1` at once. */
const fakeFlow = (asked: Ref.Ref<ReadonlyArray<BrowserAuthorization>>) =>
  LoginFlow.of({
    openUrl: () => Effect.void,
    showCode: () => Effect.void,
    ask: () => Effect.never,
    askSecret: () => Effect.never,
    waiting: () => Effect.void,
    tell: () => Effect.void,
    authorizeInBrowser: (authorization) =>
      Ref.update(asked, (all) => [...all, authorization]).pipe(
        Effect.as<Authorized>({
          code: "c1",
          verifier: "v1",
          redirectUri: redirectOf(authorization.returnTo),
          state: "s1",
          clientId: Option.none(),
        }),
      ),
  });

const logIn = Effect.fn("logIn")(function* (way: string, status: number) {
  const sent = yield* Ref.make<ReadonlyArray<Sent>>([]);
  const asked = yield* Ref.make<ReadonlyArray<BrowserAuthorization>>([]);

  const tokens = () =>
    Response.json({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }, { status });

  const method = claudeMethod(stubHttp(sent, tokens));
  if (!LoginMethod.$is("Flow")(method)) return yield* Effect.die("anthropic is a Flow login");

  const exit = yield* Effect.exit(
    method.logIn(way).pipe(Effect.provideService(LoginFlow, fakeFlow(asked))),
  );

  return { exit, sent: yield* Ref.get(sent), asked: yield* Ref.get(asked) };
});

effectTest(
  "the browser way returns to Claude Code's local callback and exchanges the code as JSON",
  Effect.gen(function* () {
    const { exit, sent, asked } = yield* logIn("browser", 200);
    const credential = yield* exit;

    expect(Predicate.isTagged(credential, "OAuth") && Redacted.value(credential.access)).toBe(
      "at-1",
    );

    expect(asked[0]).toMatchObject({
      authorizeUrl: "https://claude.ai/oauth/authorize",
      params: { client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e", code: "true" },
      returnTo: LoginReturn.Callback({ host: "localhost", port: 53692, path: "/callback" }),
    });

    expect(sent[0]?.url.href).toBe("https://platform.claude.com/v1/oauth/token");

    expect(sent[0]?.body).toEqual({
      grant_type: "authorization_code",
      code: "c1",
      state: "s1",
      redirect_uri: "http://localhost:53692/callback",
      code_verifier: "v1",
      client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    });
  }),
  Layer.empty,
);

effectTest(
  "the code way returns to the page that shows the code",
  Effect.gen(function* () {
    const { exit, sent, asked } = yield* logIn("code", 200);
    yield* exit;

    expect(asked[0]?.returnTo).toEqual(
      LoginReturn.Page({ redirectUri: "https://platform.claude.com/oauth/code/callback" }),
    );

    expect(sent[0]?.body).toMatchObject({
      redirect_uri: "https://platform.claude.com/oauth/code/callback",
    });
  }),
  Layer.empty,
);

effectTest(
  "a refused exchange fails the login",
  Effect.gen(function* () {
    const { exit } = yield* logIn("browser", 400);

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("Claude sign-in failed");
  }),
  Layer.empty,
);
