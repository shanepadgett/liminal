/**
 * Provider `openrouter` over a stub HTTP client: its login, the key it signs with, the reasoning
 * and cache fields sent, and a streamed reply whose reasoning details go back on the next turn. The
 * reply is a hand-written Chat Completions stream, as recording one would spend a key's credit.
 */

import { expect } from "bun:test";

import { ConfigProvider, Effect, Exit, Layer, Option, Ref, Schema, Stream } from "effect";
import { HttpClient } from "effect/http";

import credentialStore from "@liminal/credential-store";
import decisions from "@liminal/decisions";
import { Decided, DecisionModels, Decisions } from "@liminal/decisions/contract";
import logins from "@liminal/logins";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelCatalog } from "@liminal/model-catalog/contract";
import models from "@liminal/models";
import { Models } from "@liminal/models/contract";
import {
  BoolQuestion,
  type ModelContent,
  type ModelRequest,
  ThinkingBudget,
  ThinkingEffort,
  ThinkingOff,
} from "@liminal/sdk";
import {
  dataEvent,
  effectTest,
  eventStream,
  type Sent,
  serverOf,
  stubHttp,
  testBaseServices,
} from "@liminal/sdk/testing";

import { openRouterLogin, openRouterProvider } from "../src/contract.ts";
import { openRouterLayer } from "../src/server/provider.ts";

const chunk = (delta: Readonly<Record<string, Schema.Json>>, finish: Schema.Json = null) =>
  dataEvent({
    id: "gen-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "vendor/model-test",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

const details = [{ type: "reasoning.text", text: "Hm.", signature: "sig", index: 0 }];

/** A reply that reasons, with the upstream model's details, then says "Hi". */
const replyEvents = [
  chunk({ role: "assistant", reasoning: "Hm.", reasoning_details: details }),
  chunk({ content: "Hi" }),
  dataEvent({
    id: "gen-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "vendor/model-test",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
  }),
  "data: [DONE]\n\n",
];

const sent = Ref.makeUnsafe<ReadonlyArray<Sent>>([]);

/** Jev's System One answer to the one yes or no question the decision test asks. */
const jevAnswer = () =>
  new Response(JSON.stringify({ answers: { network: { type: "noul", noul: 0.25 } } }), {
    headers: { "content-type": "application/json" },
  });

const stub = Layer.succeed(
  HttpClient.HttpClient,
  stubHttp(sent, (url) =>
    url.pathname.endsWith("/systemone") ? jevAnswer() : eventStream(replyEvents),
  ),
);

const fakeCatalog = Layer.succeed(
  ModelCatalog,
  ModelCatalog.of({
    models: () =>
      Effect.succeed([
        {
          info: {
            id: "vendor/model-test",
            name: "Model Test",
            contextWindow: 200_000,
            maxOutput: 64_000,
            thinking: [],
            input: ["text"],
          },
          package: Option.none(),
        },
      ]),
  }),
);

const stack = Layer.unwrap(
  Effect.as(
    Ref.set(sent, []),
    openRouterLayer.pipe(
      Layer.provideMerge(stub),
      Layer.provideMerge(serverOf(logins)),
      Layer.provideMerge(serverOf(models)),
      Layer.provideMerge(serverOf(decisions)),
      Layer.provideMerge(fakeCatalog),
      Layer.provideMerge(serverOf(credentialStore)),
      Layer.provideMerge(testBaseServices),
    ),
  ),
);

/** The answering model's id, or the skip reason and message. */
const outcome = (decided: Decided) =>
  Decided.$match(decided, {
    Answered: ({ model }) => model,
    Skipped: ({ reason, message }) => `${reason}: ${message}`,
  });

const withKey = ConfigProvider.fromEnv({ env: { OPENROUTER_API_KEY: "sk-or-env" } });
const noKey = ConfigProvider.fromEnv({ env: {} });

const text = (said: string) => ({ type: "text" as const, text: said, providerData: {} });

const requestWith = (messages: ReadonlyArray<ModelContent>): ModelRequest => ({
  model: { provider: openRouterProvider, id: "vendor/model-test" },
  messages,
  tools: [],
  thinking: ThinkingEffort.make({ effort: "high" }),
});

const Body = Schema.Struct({
  reasoning: Schema.Json,
  messages: Schema.Array(Schema.Record(Schema.String, Schema.Json)),
});

const firstBody = Effect.flatMap(Ref.get(sent), (all) =>
  Schema.decodeUnknownEffect(Body)(all[0]?.body),
);

effectTest(
  "registers the OpenRouter API key login",
  Effect.gen(function* () {
    const method = yield* (yield* LoginMethods).get(openRouterLogin);

    expect(Option.getOrThrow(method)).toEqual(
      LoginMethod.ApiKey({
        id: "openrouter",
        vendor: { id: "openrouter", name: "OpenRouter" },
        title: "API key",
        env: "OPENROUTER_API_KEY",
      }),
    );
  }),
  stack,
);

effectTest(
  "streams a reply from OpenRouter, sending the effort and cache marks",
  Effect.gen(function* () {
    const request = requestWith([
      { role: "system", parts: [text("Be brief.")], cache: "breakpoint" },
      { role: "user", parts: [text("Hello")] },
    ]);

    const events = yield* Stream.runCollect((yield* Models).stream(request));
    const [first] = yield* Ref.get(sent);
    const body = yield* firstBody;

    expect(events.at(-1)).toMatchObject({ type: "finish", reason: "stop" });
    expect(first?.url.href).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(first?.headers).toMatchObject({ authorization: "Bearer sk-or-env" });
    expect(body.reasoning).toEqual({ effort: "high" });
    expect(JSON.stringify(body.messages[0])).toContain('"cache_control":{"type":"ephemeral"}');
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "sends a thinking budget as reasoning max_tokens and off as reasoning disabled",
  Effect.gen(function* () {
    const said: ReadonlyArray<ModelContent> = [{ role: "user", parts: [text("Hello")] }];

    for (const thinking of [ThinkingBudget.make({ tokens: 2048 }), ThinkingOff.make({})]) {
      yield* Stream.runDrain((yield* Models).stream({ ...requestWith(said), thinking }));
    }

    const bodies = (yield* Ref.get(sent)).map((each) => each.body);

    expect(bodies[0]).toMatchObject({ reasoning: { max_tokens: 2048 } });
    expect(bodies[1]).toMatchObject({ reasoning: { enabled: false } });
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "sends a forced tool choice and names the cheap model",
  Effect.gen(function* () {
    const service = yield* Models;

    const tool = {
      name: "submit",
      description: "Gives the answer.",
      parameters: { type: "object", properties: {} },
      offered: true,
    };

    yield* Stream.runDrain(
      service.stream({
        ...requestWith([{ role: "user", parts: [text("Hello")] }]),
        tools: [tool],
        toolChoice: { tool: "submit" },
      }),
    );

    const [first] = (yield* Ref.get(sent)).map((each) => each.body);

    expect(first).toMatchObject({
      tool_choice: { type: "function", function: { name: "submit" } },
    });

    expect((yield* service.cheap(openRouterProvider)).model.id).toBe(
      "~deepseek/deepseek-flash-latest",
    );
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "sends the reasoning details back on the next turn",
  Effect.gen(function* () {
    const reply = yield* Stream.runCollect(
      (yield* Models).stream(requestWith([{ role: "user", parts: [text("Hello")] }])),
    );

    const parts = reply.flatMap((event) => (event.type === "part-end" ? [event.part] : []));

    yield* Ref.set(sent, []);

    yield* Stream.runDrain(
      (yield* Models).stream(
        requestWith([
          { role: "user", parts: [text("Hello")] },
          { role: "assistant", parts },
          { role: "user", parts: [text("Again")] },
        ]),
      ),
    );

    expect(JSON.stringify((yield* firstBody).messages[1])).toContain('"signature":"sig"');
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "fails as an auth error with no key, sending nothing",
  Effect.gen(function* () {
    const request = requestWith([{ role: "user", parts: [text("Hello")] }]);
    const exit = yield* Effect.exit(Stream.runDrain((yield* Models).stream(request)));

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("auth");
    expect(yield* Ref.get(sent)).toEqual([]);
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, noKey)),
  stack,
);

effectTest(
  "registers Jev and Luna Decisions on the key, and asks Jev first through System One",
  Effect.gen(function* () {
    const registered = yield* (yield* DecisionModels).list;
    expect(registered.map((model) => model.id)).toEqual(["openrouter/jev", "openrouter/luna"]);

    const question = BoolQuestion.make({
      instructions: "Does it reach the network?",
      criteria: { true: "It connects out", false: "It stays local" },
    });

    const decided = yield* (yield* Decisions).classify(
      { command: "ls" },
      { network: question },
      "auto",
    );

    expect(outcome(decided)).toBe("openrouter/jev");

    const [request] = yield* Ref.get(sent);
    expect(request?.url.toString()).toBe("https://openrouter.ai/api/v1/systemone");
    expect(request?.headers["authorization"]).toBe("Bearer sk-or-env");
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, withKey)),
  stack,
);

effectTest(
  "without a key the decision models are unavailable",
  Effect.gen(function* () {
    const decided = yield* (yield* Decisions).classify({}, {}, "auto");

    expect(outcome(decided)).toStartWith("unavailable:");
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, noKey)),
  stack,
);
