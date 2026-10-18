/** Browser sign-in: the browser coming back, a pasted address, a stale reply and a taken port. */

import { expect } from "bun:test";

import { Deferred, Effect, Exit, Fiber, Ref } from "effect";
import { badArgument } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import type { BrowserAuthorization } from "../src/contract.ts";
import { authorizeInBrowser, type BrowserSteps } from "../src/server/browser.ts";

/** Records each command it is asked to run, and fails it, as when no browser opens. */
const recordingSpawner = (ran: Ref.Ref<ReadonlyArray<string>>) =>
  ChildProcessSpawner.make((command) =>
    Ref.update(ran, (all) =>
      all.concat(ChildProcess.isStandardCommand(command) ? [command.command] : []),
    ).pipe(Effect.andThen(Effect.fail(badArgument({ module: "test", method: "spawn" })))),
  );

const authorization = (port: number): BrowserAuthorization => ({
  authorizeUrl: "https://auth.example.com/oauth/authorize",
  params: { client_id: "client-1", scope: "openid" },
  callback: { host: "127.0.0.1", port, path: "/auth/callback" },
});

/** Steps that keep what was shown and answer the question with `answer(url)`. */
const makeSteps = Effect.fn("makeSteps")(function* (answer: (url: URL) => Effect.Effect<string>) {
  const opened = yield* Deferred.make<URL>();
  const told = yield* Ref.make<ReadonlyArray<string>>([]);

  const steps: BrowserSteps = {
    openUrl: (url) => Deferred.complete(opened, Effect.succeed(new URL(url))).pipe(Effect.asVoid),
    ask: () => Effect.flatMap(Deferred.await(opened), answer),
    tell: (text) => Ref.update(told, (all) => all.concat([text])),
  };

  return { steps, opened, told };
});

const withSpawner = <A, E, R>(
  effect: (ran: Ref.Ref<ReadonlyArray<string>>) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const ran = yield* Ref.make<ReadonlyArray<string>>([]);

    return yield* effect(ran).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, recordingSpawner(ran)),
    );
  });

const address = (code: string, state: string | null) =>
  `http://127.0.0.1:1/auth/callback?code=${code}&state=${state ?? ""}`;

effectTest(
  "the browser coming back to the callback gives its code, verifier and redirect address",
  withSpawner((ran) =>
    Effect.gen(function* () {
      const { steps, opened, told } = yield* makeSteps(() => Effect.never);
      const running = yield* Effect.forkChild(authorizeInBrowser(steps, "acme")(authorization(0)));
      const url = yield* Deferred.await(opened);
      const redirect = url.searchParams.get("redirect_uri") ?? "";
      const state = url.searchParams.get("state");

      expect(url.searchParams.get("client_id")).toBe("client-1");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");

      yield* Effect.promise(() => fetch(`${redirect}?code=c1&state=${state ?? ""}`));
      const authorized = yield* Fiber.join(running);

      expect(authorized.code).toBe("c1");
      expect(authorized.redirectUri).toBe(redirect);
      expect(authorized.verifier.length).toBeGreaterThan(40);
      expect((yield* Ref.get(ran)).length).toBe(1);
      expect(yield* Ref.get(told)).toEqual(["Could not open the browser; open the link above."]);
    }),
  ),
  testBaseServices,
);

effectTest(
  "a pasted address completes the sign-in",
  withSpawner(() =>
    Effect.gen(function* () {
      const { steps } = yield* makeSteps((url) =>
        Effect.succeed(address("p1", url.searchParams.get("state"))),
      );

      const authorized = yield* authorizeInBrowser(steps, "acme")(authorization(0));
      expect(authorized.code).toBe("p1");
    }),
  ),
  testBaseServices,
);

effectTest(
  "a reply with another login's state fails the sign-in",
  withSpawner(() =>
    Effect.gen(function* () {
      const { steps } = yield* makeSteps(() => Effect.succeed(address("p1", "other")));
      const exit = yield* Effect.exit(authorizeInBrowser(steps, "acme")(authorization(0)));

      expect(Exit.isFailure(exit)).toBe(true);
    }),
  ),
  testBaseServices,
);

effectTest(
  "a taken port says so, and a pasted address still signs in",
  withSpawner(() =>
    Effect.gen(function* () {
      const taken = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() }),
        ),
        (server) => Effect.promise(() => server.stop(true)),
      );

      const port = taken.port ?? 0;

      const { steps, told } = yield* makeSteps((url) =>
        Effect.succeed(address("p2", url.searchParams.get("state"))),
      );

      const authorized = yield* authorizeInBrowser(steps, "acme")(authorization(port));

      expect(authorized.code).toBe("p2");
      expect((yield* Ref.get(told))[0]).toContain(`Port ${port} is in use`);
    }),
  ),
  testBaseServices,
);

effectTest(
  "the callback port closes when the sign-in ends",
  withSpawner(() =>
    Effect.gen(function* () {
      const { steps, opened } = yield* makeSteps((url) =>
        Effect.succeed(address("p3", url.searchParams.get("state"))),
      );

      yield* authorizeInBrowser(steps, "acme")(authorization(0));
      const redirect = (yield* Deferred.await(opened)).searchParams.get("redirect_uri") ?? "";

      const reached = yield* Effect.promise(() =>
        fetch(redirect).then(
          () => true,
          () => false,
        ),
      );

      expect(reached).toBe(false);
    }),
  ),
  testBaseServices,
);
