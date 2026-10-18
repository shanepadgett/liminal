/**
 * Runs one login at a time per method: its steps go out on the `logins/start` stream, and the
 * answer to its open question comes back through `logins/answer`.
 */

import {
  type Cause,
  type Data,
  Deferred,
  Effect,
  Option,
  Queue,
  Redacted,
  Ref,
  Stream,
} from "effect";

import { ApiKey, type Credential, CredentialStore } from "@liminal/credential-store/contract";

import {
  Ask,
  Done,
  LoginFailed,
  LoginFlow,
  LoginMethod,
  LoginMethods,
  type LoginStep,
  OpenUrl,
  ShowCode,
  Told,
  Waiting,
} from "../contract.ts";

type Steps = Queue.Queue<LoginStep, LoginFailed | Cause.Done>;

/** The open question of each running login, by method. */
type Pending = Ref.Ref<ReadonlyMap<string, Deferred.Deferred<string>>>;

const without = <V>(map: ReadonlyMap<string, V>, key: string, value: V) => {
  if (map.get(key) !== value) return map;
  const next = new Map(map);
  next.delete(key);

  return next;
};

/** Sends a question and waits for its answer; a newer question for the method replaces it. */
const ask =
  (pending: Pending, steps: Steps, method: string) => (question: string, isSecret: boolean) =>
    Effect.gen(function* () {
      const answer = yield* Deferred.make<string>();
      yield* Ref.update(pending, (open) => new Map(open).set(method, answer));

      return yield* Queue.offer(steps, Ask.make({ question, isSecret })).pipe(
        Effect.andThen(Deferred.await(answer)),
        Effect.ensuring(Ref.update(pending, (open) => without(open, method, answer))),
      );
    });

const flowOf = (pending: Pending, steps: Steps, method: string) => {
  const question = ask(pending, steps, method);
  const send = (step: LoginStep) => Effect.asVoid(Queue.offer(steps, step));

  return LoginFlow.of({
    openUrl: (url) => send(OpenUrl.make({ url })),
    showCode: (code, url) => send(ShowCode.make({ code, url })),
    ask: (text) => question(text, false),
    askSecret: (text) => Effect.map(question(text, true), Redacted.make),
    waiting: (text) => send(Waiting.make({ text })),
    tell: (text) => send(Told.make({ text })),
  });
};

/** Asks for the key. */
const apiKeyLogin = Effect.fn("Logins.apiKeyLogin")(function* (id: string) {
  const flow = yield* LoginFlow;
  const key = (yield* flow.askSecret("API key")).pipe(Redacted.value).trim();

  if (key === "") return yield* new LoginFailed({ method: id, message: "No key was entered" });

  return ApiKey.make({ key: Redacted.make(key) });
});

/** The way to finish a flow: the one asked for, else its first. */
const wayOf = (method: Data.TaggedEnum.Value<LoginMethod, "Flow">, way: string | undefined) => {
  const found = way === undefined ? method.ways[0] : method.ways.find((each) => each.id === way);
  if (found !== undefined) return Effect.succeed(found.id);

  return Effect.fail(
    new LoginFailed({ method: method.id, message: `${method.title} has no way ${way ?? ""}` }),
  );
};

/** Runs the method's login and gives the credential it produced. */
const logIn = (
  method: LoginMethod,
  way: string | undefined,
): Effect.Effect<Credential, LoginFailed, LoginFlow> =>
  LoginMethod.$is("ApiKey")(method)
    ? apiKeyLogin(method.id)
    : Effect.flatMap(wayOf(method, way), method.logIn);

export const makeRunner = Effect.gen(function* () {
  const methods = yield* LoginMethods;
  const store = yield* CredentialStore;

  const pending: Pending = yield* Ref.make<ReadonlyMap<string, Deferred.Deferred<string>>>(
    new Map(),
  );

  const find = Effect.fn("Logins.find")(function* (id: string) {
    const method = yield* methods.get(id);
    if (Option.isSome(method)) return method.value;

    return yield* new LoginFailed({ method: id, message: `No login method ${id}` });
  });

  const save = (id: string, credential: Credential) =>
    store
      .set(id, credential)
      .pipe(Effect.mapError((error) => new LoginFailed({ method: id, message: error.message })));

  /** Runs the login and saves its credential; closing the stream interrupts it. */
  const start = (id: string, way: string | undefined): Stream.Stream<LoginStep, LoginFailed> =>
    Stream.callback<LoginStep, LoginFailed>((steps) =>
      find(id).pipe(
        Effect.flatMap((method) => logIn(method, way)),
        Effect.provideService(LoginFlow, flowOf(pending, steps, id)),
        Effect.flatMap((credential) => save(id, credential)),
        Effect.andThen(Queue.offer(steps, Done.make({}))),
        Effect.andThen(Queue.end(steps)),
      ),
    );

  const answer = Effect.fn("Logins.answer")(function* (id: string, text: string) {
    const open = (yield* Ref.get(pending)).get(id);

    if (open === undefined)
      return yield* new LoginFailed({
        method: id,
        message: `No ${id} login is waiting for an answer`,
      });

    return yield* Deferred.succeed(open, text).pipe(Effect.asVoid);
  });

  return { find, start, answer };
});
