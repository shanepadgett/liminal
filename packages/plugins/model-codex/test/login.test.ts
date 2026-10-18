/** The Codex login over fake OpenAI endpoints: browser, device code, and what fails it. */

import { expect } from "bun:test";

import { Effect, Exit, Fiber, Layer, Option, Predicate, Redacted, Ref } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";

import { type BrowserAuthorization, LoginFlow, LoginMethod } from "@liminal/logins/contract";
import { effectTest } from "@liminal/sdk/testing";

import { codexMethod } from "../src/server/login.ts";
import { fakeAccessToken } from "./support.ts";

interface Endpoints {
  readonly usercodeStatus: number;
  readonly access: string;
}

/** Fake auth.openai.com: one pending poll, then the device code is entered. */
const fakeAuth = (sent: Ref.Ref<ReadonlyArray<string>>, endpoints: Endpoints) => {
  let polls = 0;

  const reply = (path: string) => {
    if (path === "/api/accounts/deviceauth/usercode")
      return Response.json(
        { device_auth_id: "d1", user_code: "ABCD-1234", interval: "5" },
        { status: endpoints.usercodeStatus },
      );

    if (path === "/api/accounts/deviceauth/token") {
      polls += 1;

      return polls === 1
        ? new Response("", { status: 403 })
        : Response.json({ authorization_code: "dc", code_verifier: "dv" });
    }

    return Response.json({ access_token: endpoints.access, refresh_token: "r1", expires_in: 3600 });
  };

  return HttpClient.make((request) => {
    const body = Predicate.isTagged(request.body, "Uint8Array")
      ? new TextDecoder().decode(request.body.body)
      : "";

    const path = new URL(request.url).pathname;

    return Effect.as(
      Ref.update(sent, (all) => all.concat([`${path} ${body}`])),
      HttpClientResponse.fromWeb(request, reply(path)),
    );
  });
};

/** A flow whose browser sign-in comes back with code `bc` at once. */
const fakeFlow = (shown: Ref.Ref<ReadonlyArray<string>>) => {
  const show = (text: string) => Ref.update(shown, (all) => all.concat([text]));

  return LoginFlow.of({
    openUrl: show,
    showCode: (code, url) => show(`${code} ${url}`),
    ask: () => Effect.never,
    askSecret: () => Effect.never,
    waiting: show,
    tell: show,
    authorizeInBrowser: (authorization: BrowserAuthorization) =>
      show(`${authorization.params["originator"] ?? ""} ${authorization.callback.port}`).pipe(
        Effect.as({
          code: "bc",
          verifier: "bv",
          redirectUri: "http://127.0.0.1:1455/auth/callback",
        }),
      ),
  });
};

const logIn = Effect.fn("logIn")(function* (way: string, endpoints: Endpoints) {
  const sent = yield* Ref.make<ReadonlyArray<string>>([]);
  const shown = yield* Ref.make<ReadonlyArray<string>>([]);
  const method = codexMethod(fakeAuth(sent, endpoints));
  if (!LoginMethod.$is("Flow")(method)) return yield* Effect.die("codex is a Flow login");

  const running = yield* Effect.forkChild(
    Effect.exit(method.logIn(way).pipe(Effect.provideService(LoginFlow, fakeFlow(shown)))),
  );

  yield* TestClock.adjust("5 seconds");
  yield* TestClock.adjust("5 seconds");
  const exit = yield* Fiber.join(running);

  return { exit, sent: yield* Ref.get(sent), shown: yield* Ref.get(shown) };
});

const signedIn = { usercodeStatus: 200, access: fakeAccessToken("account-1") };

effectTest(
  "the browser way exchanges the code it comes back with for tokens",
  Effect.gen(function* () {
    const { exit, sent, shown } = yield* logIn("browser", signedIn);
    const credential = yield* exit;

    expect(Predicate.isTagged(credential, "OAuth") && Redacted.value(credential.access)).toBe(
      signedIn.access,
    );

    expect(shown).toEqual(["liminal 1455"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("grant_type=authorization_code&code=bc&code_verifier=bv");
    expect(sent[0]).toContain("client_id=app_EMoamEEZ73f0CkXaXp7hrann");
  }),
  Layer.empty,
);

effectTest(
  "the device way shows the code, polls until it is entered, then exchanges it",
  Effect.gen(function* () {
    const { exit, sent, shown } = yield* logIn("device", signedIn);
    yield* exit;

    expect(shown).toEqual([
      "ABCD-1234 https://auth.openai.com/codex/device",
      "Waiting for the code to be entered",
    ]);

    expect(sent.map((line) => line.split(" ")[0])).toEqual([
      "/api/accounts/deviceauth/usercode",
      "/api/accounts/deviceauth/token",
      "/api/accounts/deviceauth/token",
      "/oauth/token",
    ]);

    expect(sent[3]).toContain("code=dc&code_verifier=dv");
    expect(sent[3]).toContain(encodeURIComponent("https://auth.openai.com/deviceauth/callback"));
  }),
  Layer.empty,
);

effectTest(
  "the device way says so when device sign-in is off",
  Effect.gen(function* () {
    const { exit } = yield* logIn("device", { ...signedIn, usercodeStatus: 404 });

    expect(Option.map(Exit.findErrorOption(exit), (error) => error.message)).toEqual(
      Option.some("Device code sign-in is off for this account; sign in in the browser"),
    );
  }),
  Layer.empty,
);

effectTest(
  "tokens that name no ChatGPT account fail the login",
  Effect.gen(function* () {
    const { exit } = yield* logIn("browser", { ...signedIn, access: "not-a-jwt" });

    expect(Exit.isFailure(exit)).toBe(true);
  }),
  Layer.empty,
);
