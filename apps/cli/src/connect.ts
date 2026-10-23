/** `liminal connect`: pick a vendor, a login and a way through it, then follow its sign-in steps. */
import { Console, Deferred, Effect, Fiber, Match, Option, Redacted, Ref, Stream } from "effect";
import { Prompt } from "effect/cli";

import {
  AccountsRpc,
  type LoginMethodInfo,
  type LoginStep,
} from "@shanepadgett/liminal-accounts/contract";
import { Host } from "@shanepadgett/liminal-client";

/** Asks to pick one choice; a single choice is taken without asking. */
export const pick = <A>(
  message: string,
  choices: ReadonlyArray<{ readonly title: string; readonly value: A }>,
) => {
  const [only] = choices;
  if (choices.length === 1 && only !== undefined) return Effect.succeed(only.value);

  return Prompt.run(Prompt.Select({ message, choices }));
};

/** Asks for the vendor, then its login, then the way through it. */
const choose = (methods: ReadonlyArray<typeof LoginMethodInfo.Type>) =>
  Effect.gen(function* () {
    const vendors = [...new Set(methods.map((each) => each.vendor))];

    const vendor = yield* pick(
      "Provider",
      vendors.map((name) => ({ title: name, value: name })),
    );

    const login = yield* pick(
      "Login",
      methods.flatMap((each) =>
        each.vendor === vendor ? [{ title: each.title, value: each }] : [],
      ),
    );

    const way = yield* pick(
      "Sign in",
      login.ways.map((each) => ({ title: each.title, value: each.id })),
    );

    return { method: login.id, way };
  });

export const connect = Effect.gen(function* () {
  const host = yield* Host;
  const accounts = yield* host.client(AccountsRpc);
  const { method, way } = yield* choose(yield* accounts["accounts/methods"]());

  /** Asks the user and sends the answer to the sign-in. */
  const answer = (question: string, secret: boolean) => {
    const prompt = secret
      ? Prompt.run(Prompt.Password({ message: question }))
      : Effect.map(Prompt.run(Prompt.String({ message: question })), Redacted.make);

    return Effect.flatMap(prompt, (text) => accounts["accounts/answer"]({ method, text }));
  };

  const asking = yield* Ref.make(Option.none<Fiber.Fiber<void>>());
  const quit = yield* Deferred.make<void, Effect.Error<ReturnType<typeof answer>>>();

  /** Asks in the background, so a later step, such as the browser coming back, withdraws it. */
  const ask = (question: string, secret: boolean) =>
    Effect.gen(function* () {
      const answering = answer(question, secret).pipe(
        Effect.catch((error) => Deferred.fail(quit, error)),
        Effect.asVoid,
      );

      yield* Ref.set(asking, Option.some(yield* Effect.forkChild(answering)));
    });

  const show = (step: LoginStep) =>
    Effect.gen(function* () {
      const open = yield* Ref.getAndSet(asking, Option.none());
      if (Option.isSome(open)) yield* Fiber.interrupt(open.value);

      yield* Match.valueTags(step, {
        OpenUrl: ({ url }) => Console.log(`Sign in at:\n${url}\n`),
        ShowCode: ({ code, url }) => Console.log(`Enter the code ${code} at ${url}`),
        Ask: ({ question, secret }) => ask(question, secret),
        Waiting: ({ text }) => Console.log(text),
        Told: ({ text }) => Console.log(text),
        Done: () => Console.log("Connected."),
      });
    });

  yield* Effect.raceFirst(
    accounts["accounts/sign-in"]({ method, way }).pipe(Stream.runForEach(show)),
    Deferred.await(quit),
  );
});
