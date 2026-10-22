/**
 * Runs a login method: its actions go out as steps on the `accounts/sign-in` stream, and the answer
 * to its open question comes back through `accounts/answer`.
 */
import { type Cause, Crypto, Deferred, Effect, Queue, Redacted, Ref, Stream } from "effect";

import { authorizeInBrowser, type BrowserSteps } from "./browser.ts";
import {
  Ask,
  Credentials,
  Done,
  LoginFailed,
  LoginFlow,
  type LoginMethod,
  LoginMethods,
  type LoginStep,
  type LoginWay,
  OpenUrl,
  ShowCode,
  Told,
  Waiting,
} from "./contract.ts";

type Steps = Queue.Queue<LoginStep, LoginFailed | Cause.Done>;

/** The open question of each running sign-in, by method. */
type Pending = Ref.Ref<ReadonlyMap<string, Deferred.Deferred<Redacted.Redacted>>>;

const without = <V>(map: ReadonlyMap<string, V>, key: string, value: V) => {
  if (map.get(key) !== value) return map;
  const next = new Map(map);
  next.delete(key);

  return next;
};

/** Sends a question and waits for its answer. */
const asker =
  (pending: Pending, steps: Steps, method: string) => (question: string, secret: boolean) =>
    Effect.gen(function* () {
      const answer = yield* Deferred.make<Redacted.Redacted>();
      yield* Ref.update(pending, (open) => new Map(open).set(method, answer));

      return yield* Queue.offer(steps, Ask.make({ question, secret })).pipe(
        Effect.andThen(Deferred.await(answer)),
        Effect.ensuring(Ref.update(pending, (open) => without(open, method, answer))),
      );
    });

const flowOf = (pending: Pending, steps: Steps, method: string, crypto: Crypto.Crypto) => {
  const ask = asker(pending, steps, method);
  const send = (step: LoginStep) => Effect.asVoid(Queue.offer(steps, step));

  const browserSteps: BrowserSteps = {
    openUrl: (url) => send(OpenUrl.make({ url })),
    ask: (question) => Effect.map(ask(question, false), Redacted.value),
    tell: (text) => send(Told.make({ text })),
  };

  const browser = authorizeInBrowser(browserSteps, method);

  return LoginFlow.of({
    ...browserSteps,
    showCode: (code, url) => send(ShowCode.make({ code, url })),
    askSecret: (question) => ask(question, true),
    waiting: (text) => send(Waiting.make({ text })),
    authorizeInBrowser: (authorization) =>
      browser(authorization).pipe(Effect.provideService(Crypto.Crypto, crypto)),
  });
};

export const makeSignIn = Effect.gen(function* () {
  const methods = yield* LoginMethods;
  const credentials = yield* Credentials;
  const crypto = yield* Crypto.Crypto;

  const pending: Pending = yield* Ref.make<
    ReadonlyMap<string, Deferred.Deferred<Redacted.Redacted>>
  >(new Map());

  /** The login method `id` and its way `way`. */
  const find = Effect.fn("Accounts.find")(function* (id: string, way: string) {
    const method = (yield* methods.list).findLast((each) => each.id === id);

    if (method === undefined) {
      return yield* new LoginFailed({ method: id, message: `No login method ${id} exists.` });
    }

    const chosen = method.ways.find((each) => each.id === way);
    if (chosen !== undefined) return { method, way: chosen };

    return yield* new LoginFailed({ method: id, message: `The login ${id} has no way ${way}.` });
  });

  const save = ({ method, way }: { readonly method: LoginMethod; readonly way: LoginWay }) =>
    Effect.flatMap(way.run, (credential) =>
      credentials
        .set(method.provider, credential)
        .pipe(
          Effect.mapError(
            (error) => new LoginFailed({ method: method.id, message: error.message }),
          ),
        ),
    );

  /** Runs the method and saves its credential; closing the stream interrupts it. */
  const signIn = (id: string, way: string): Stream.Stream<LoginStep, LoginFailed> =>
    Stream.callback<LoginStep, LoginFailed>((steps) =>
      find(id, way).pipe(
        Effect.flatMap(save),
        Effect.provideService(LoginFlow, flowOf(pending, steps, id, crypto)),
        Effect.andThen(Queue.offer(steps, Done.make({}))),
        Effect.andThen(Queue.end(steps)),
        Effect.catch((error) => Queue.fail(steps, error)),
      ),
    );

  const answer = Effect.fn("Accounts.answer")(function* (id: string, text: Redacted.Redacted) {
    const open = (yield* Ref.get(pending)).get(id);

    if (open === undefined) {
      return yield* new LoginFailed({
        method: id,
        message: `No ${id} sign-in is waiting for an answer.`,
      });
    }

    return yield* Effect.asVoid(Deferred.succeed(open, text));
  });

  return { methods, signIn, answer };
});
