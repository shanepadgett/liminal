/**
 * Provider `codex` replayed from recordings: the model list, a tool call, its reply, refresh,
 * errors.
 */

import { expect } from "bun:test";

import { Duration, Effect, Layer, Option, Redacted, Ref, Schema, Stream } from "effect";

import { CredentialStore, OAuth } from "@liminal/credential-store/contract";
import { Models } from "@liminal/models/contract";
import { ModelError, type ModelRequest } from "@liminal/sdk";
import { effectTest } from "@liminal/sdk/testing";

import { codexLogin, codexProvider } from "../src/contract.ts";
import { type Answer, replay, type SentRequest, sentBody } from "./replay.ts";
import {
  codexStack,
  fakeAccessToken,
  finishedParts,
  firstMessages,
  noteText,
  oauth,
  readTool,
  secondMessages,
} from "./support.ts";

const access = fakeAccessToken("acc-1");
const valid = oauth(access, Number.MAX_SAFE_INTEGER);
const model = { provider: codexProvider, id: "gpt-5.6-luna" };

const request = (messages: ModelRequest["messages"]): ModelRequest => ({
  model,
  messages,
  tools: [readTool],
  thinking: "high",
  cacheKey: "session-1",
});

const sent = Ref.makeUnsafe<ReadonlyArray<SentRequest>>([]);

const stackWith = (answers: Readonly<Record<string, ReadonlyArray<Answer>>>, credential = valid) =>
  Layer.unwrap(Effect.as(Ref.set(sent, []), codexStack(replay(answers, sent), credential)));

const recorded = stackWith({
  models: [{ fixture: "models.json" }],
  responses: [{ fixture: "tool-call.sse" }, { fixture: "reply.sse" }],
});

const bodyOf = (index: number) => sentBody(sent, index);

effectTest(
  "lists the plan's models with their windows and thinking levels, leaving hidden ones out",
  Effect.gen(function* () {
    const listed = yield* (yield* Models).listModels(codexProvider);
    const luna = listed.find((info) => info.id === "gpt-5.6-luna");

    expect(luna).toMatchObject({ contextWindow: 272_000, input: ["text", "image"] });
    expect(luna?.thinking).toEqual(["low", "medium", "high", "xhigh"]);
    expect(listed.some((info) => info.id === "codex-auto-review")).toBe(false);

    const [list] = yield* Ref.get(sent);
    expect(list?.url).toContain("client_version=0.200.0");

    expect(list?.headers).toMatchObject({
      authorization: `Bearer ${access}`,
      "chatgpt-account-id": "acc-1",
    });
  }),
  recorded,
);

effectTest(
  "streams reasoning and a tool call, then a reply that sends the reasoning back",
  Effect.gen(function* () {
    const models = yield* Models;
    const events = yield* Stream.runCollect(models.stream(request(firstMessages)));
    const first = finishedParts(events);

    expect(events[0]).toEqual({ type: "start" });
    expect(events.at(-1)).toMatchObject({ type: "finish", reason: "tool-calls" });
    expect(first.map((part) => part.type)).toEqual(["reasoning", "tool-call"]);
    expect(first[1]).toMatchObject({ name: "read", params: { path: "notes.txt" } });

    const indexes = events.flatMap((event) => ("index" in event ? [event.index] : []));
    expect(new Set(indexes)).toEqual(new Set([0, 1]));

    const body = yield* bodyOf(0);

    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      stream: true,
      store: false,
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: "session-1",
      reasoning: { effort: "high", summary: "auto" },
      tools: [{ type: "function", name: "read" }],
    });

    expect(body.input[0]).toMatchObject({ role: "developer" });

    expect((yield* Ref.get(sent))[0]?.headers).toMatchObject({
      "session-id": "session-1",
      originator: "liminal",
    });

    const reply = finishedParts(
      yield* Stream.runCollect(models.stream(request(secondMessages(first)))),
    );

    const last = reply.at(-1);
    expect(last?.type === "text" && last.text).toContain("Thursday");

    const second = yield* bodyOf(1);

    const types = second.input.map((item) => item.type ?? item.role);

    expect(types).toEqual([
      "developer",
      "user",
      "reasoning",
      "function_call",
      "function_call_output",
    ]);

    const sentBack = second.input[2] ?? {};
    expect(sentBack.encrypted_content).toStartWith("gAAAA");

    expect(first[0]).toMatchObject({
      providerData: {
        openai: { itemId: sentBack.id, encryptedContent: sentBack.encrypted_content },
      },
    });

    expect(second.input[4]?.output).toContain(noteText);
  }),
  recorded,
);

effectTest(
  "refreshes an expiring login before the call and saves the new tokens",
  Effect.gen(function* () {
    yield* (yield* Models).listModels(codexProvider);

    const [token, list] = yield* Ref.get(sent);
    expect(token?.url).toBe("https://auth.openai.com/oauth/token");
    expect(token?.body).toContain("grant_type=refresh_token");
    expect(list?.headers).toMatchObject({ authorization: `Bearer ${fakeAccessToken("acc-2")}` });

    const saved = yield* (yield* CredentialStore).get(codexLogin);
    const tokens = Option.getOrThrow(saved);
    expect(Schema.is(OAuth)(tokens) && Redacted.value(tokens.refresh)).toBe("refresh-2");
  }),
  stackWith(
    {
      token: [
        {
          text: JSON.stringify({
            access_token: fakeAccessToken("acc-2"),
            refresh_token: "refresh-2",
            expires_in: 3600,
          }),
        },
      ],
      models: [{ fixture: "models.json" }],
    },
    oauth(access, 0),
  ),
);

effectTest(
  "a refused call fails with its reason, status and retry delay",
  Effect.gen(function* () {
    const error = yield* Stream.runDrain((yield* Models).stream(request(firstMessages))).pipe(
      Effect.catchTag("ProviderNotFound", Effect.die),
      Effect.flip,
    );

    expect(error).toBeInstanceOf(ModelError);
    expect(error).toMatchObject({ reason: "rate-limit", status: 429 });
    expect(error.retryAfter).toEqual(Duration.seconds(7));
  }),
  stackWith({
    responses: [
      {
        status: 429,
        headers: { "retry-after": "7", "content-type": "application/json" },
        text: JSON.stringify({ error: { message: "Slow down", type: "rate_limit", code: null } }),
      },
    ],
  }),
);
