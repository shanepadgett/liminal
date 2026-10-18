/** Logins over its RPCs: an API key login, sign-in states, sign-out, and stopping a running login. */

import { expect } from "bun:test";

import {
  ConfigProvider,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Redacted,
  Stream,
} from "effect";
import { RpcTest } from "effect/rpc";

import credentialStore from "@liminal/credential-store";
import { ApiKey, CredentialStore } from "@liminal/credential-store/contract";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import logins from "../plugin.ts";
import {
  Ask,
  Done,
  FromEnv,
  LoginFlow,
  LoginMethod,
  LoginMethods,
  LoginsRpcs,
  type LoginStep,
  Saved,
  SignedOut,
  Waiting,
} from "../src/contract.ts";

const stackWith = (env: Record<string, string>) =>
  serverOf(logins).pipe(
    Layer.provideMerge(serverOf(credentialStore)),
    Layer.provideMerge(testBaseServices),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
  );

const stack = stackWith({});

const vendor = { id: "acme", name: "Acme" };

const apiKey = LoginMethod.ApiKey({ id: "acme", vendor, title: "API key", env: "ACME_API_KEY" });

const token = ApiKey.make({ key: Redacted.make("k") });

const register = Effect.fn("register")(function* (method: LoginMethod) {
  yield* (yield* LoginMethods).register(method);
});

/** Runs a login, answering each question with `answer`, and gives its steps' tags. */
const runLogin = Effect.fn("runLogin")(function* (method: string, answer: string) {
  const client = yield* RpcTest.makeClient(LoginsRpcs);

  const steps = yield* client["logins/start"]({ method }).pipe(
    Stream.tap((step: LoginStep) =>
      Predicate.isTagged(step, "Ask")
        ? client["logins/answer"]({ method, text: answer })
        : Effect.void,
    ),
    Stream.runCollect,
  );

  return steps;
});

const stateOf = Effect.fn("stateOf")(function* (method: string) {
  const client = yield* RpcTest.makeClient(LoginsRpcs);
  const listed = yield* client["logins/list"]();

  return listed.find((info) => info.id === method)?.state;
});

effectTest(
  "an API key login asks for the key, saves it, and the method shows as saved",
  Effect.gen(function* () {
    yield* register(apiKey);
    expect(yield* stateOf("acme")).toEqual(SignedOut.make({}));

    expect(yield* runLogin("acme", " sk-1 ")).toEqual([
      Ask.make({ question: "API key", isSecret: true }),
      Done.make({}),
    ]);

    const secret = yield* (yield* CredentialStore).secret("acme", {});
    expect(Option.map(secret, Redacted.value)).toEqual(Option.some("sk-1"));
    expect(yield* stateOf("acme")).toEqual(Saved.make({}));
  }),
  stack,
);

effectTest(
  "an empty key fails the login and saves nothing",
  Effect.gen(function* () {
    yield* register(apiKey);
    const exit = yield* Effect.exit(runLogin("acme", "  "));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(yield* (yield* CredentialStore).get("acme")).toEqual(Option.none());
  }),
  stack,
);

effectTest(
  "an API key in the method's variable shows the method as signed in from it",
  Effect.gen(function* () {
    yield* register(apiKey);
    expect(yield* stateOf("acme")).toEqual(FromEnv.make({ variable: "ACME_API_KEY" }));
  }),
  stackWith({ ACME_API_KEY: "sk-env" }),
);

effectTest(
  "signing out runs the method's own sign-out, then removes the credential",
  Effect.gen(function* () {
    const revoked = yield* Deferred.make<void>();

    yield* register(
      LoginMethod.Flow({
        id: "acme",
        vendor,
        title: "Acme account",
        ways: [{ id: "browser", title: "Browser" }],
        logIn: () => Effect.succeed(token),
        logOut: Option.some(Deferred.complete(revoked, Effect.void).pipe(Effect.asVoid)),
      }),
    );

    yield* (yield* CredentialStore).set("acme", token);
    yield* (yield* RpcTest.makeClient(LoginsRpcs))["logins/logout"]({ method: "acme" });

    expect(yield* Deferred.isDone(revoked)).toBe(true);
    expect(yield* stateOf("acme")).toEqual(SignedOut.make({}));
  }),
  stack,
);

effectTest(
  "a flow login's credential is saved by logins once the flow finishes",
  Effect.gen(function* () {
    yield* register(
      LoginMethod.Flow({
        id: "acme",
        vendor,
        title: "Acme account",
        ways: [{ id: "browser", title: "Browser" }],
        logIn: () => Effect.succeed(token),
        logOut: Option.none(),
      }),
    );

    expect(yield* runLogin("acme", "")).toEqual([Done.make({})]);
    expect(yield* (yield* CredentialStore).get("acme")).toEqual(Option.some(token));
  }),
  stack,
);

effectTest(
  "closing the start stream stops the running login",
  Effect.gen(function* () {
    const stopped = yield* Deferred.make<void>();

    const logIn = () =>
      Effect.gen(function* () {
        const flow = yield* LoginFlow;
        yield* flow.waiting("Waiting for the browser");

        return yield* Effect.never;
      }).pipe(Effect.onInterrupt(() => Deferred.complete(stopped, Effect.void)));

    yield* register(
      LoginMethod.Flow({
        id: "acme",
        vendor,
        title: "Acme account",
        ways: [{ id: "browser", title: "Browser" }],
        logIn,
        logOut: Option.none(),
      }),
    );

    const client = yield* RpcTest.makeClient(LoginsRpcs);

    const first = yield* client["logins/start"]({ method: "acme" }).pipe(
      Stream.take(1),
      Stream.runCollect,
    );

    expect(first).toEqual([Waiting.make({ text: "Waiting for the browser" })]);
    yield* Deferred.await(stopped);
  }),
  stack,
);
