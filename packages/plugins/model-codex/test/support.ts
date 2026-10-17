/** The codex provider over a given HTTP client, with the stores and registries it needs. */

import { Effect, Layer, Redacted } from "effect";
import { Base64Url } from "effect/encoding";
import type { HttpClient } from "effect/http";

import credentialStore from "@liminal/credential-store";
import { CredentialStore, OAuth } from "@liminal/credential-store/contract";
import models from "@liminal/models";
import type { ModelContent, ModelEvent, ModelPart, ModelTool } from "@liminal/sdk";
import { serverOf, testBaseServices } from "@liminal/sdk/testing";

import { codexLogin } from "../src/contract.ts";
import { codexLayer } from "../src/server/provider.ts";

/** A token with the claims the provider reads, signed by no one. */
export const fakeAccessToken = (accountId: string) =>
  [
    Base64Url.encode(JSON.stringify({ alg: "none" })),
    Base64Url.encode(
      JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
    ),
    "signature",
  ].join(".");

export const oauth = (access: string, expiresAt: number): OAuth =>
  OAuth.make({
    access: Redacted.make(access),
    refresh: Redacted.make("refresh-token"),
    expiresAt,
    extra: {},
  });

/** Provider `codex`, its credential saved first, over `http`. */
export const codexStack = (http: Layer.Layer<HttpClient.HttpClient>, credential: OAuth) =>
  codexLayer.pipe(
    Layer.provide(
      Layer.effectDiscard(
        Effect.gen(function* () {
          const store = yield* CredentialStore;
          yield* store.set(codexLogin, credential);
        }),
      ),
    ),
    Layer.provideMerge(http),
    Layer.provideMerge(serverOf(models)),
    Layer.provideMerge(serverOf(credentialStore)),
    Layer.provideMerge(testBaseServices),
  );

/** The scenario the recordings answer: one tool call, then a reply that uses its result. */
export const readTool: ModelTool = {
  name: "read",
  description: "Read a text file in the workspace.",
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
  offered: true,
};

export const firstMessages: ReadonlyArray<ModelContent> = [
  {
    role: "system",
    parts: [
      {
        type: "text",
        text: "You are a test agent. Use the tools you are given.",
        providerData: {},
      },
    ],
  },
  {
    role: "user",
    parts: [
      {
        type: "text",
        text: "Work out 437 × 389 step by step in your head. Then use the read tool on notes.txt, and tell me in one sentence what it says and the product.",
        providerData: {},
      },
    ],
  },
];

export const noteText = "The team meeting moved to Thursday at 10.";

/** The second request's messages: the first reply's parts, then the tool's result. */
export const secondMessages = (
  replyParts: ReadonlyArray<ModelPart>,
): ReadonlyArray<ModelContent> => {
  const call = replyParts.find((part) => part.type === "tool-call");
  if (call?.type !== "tool-call") throw new Error("the first reply has no tool call");

  return [
    ...firstMessages,
    { role: "assistant", parts: replyParts },
    {
      role: "tool",
      parts: [
        {
          type: "tool-result",
          callId: call.id,
          name: call.name,
          result: noteText,
          isFailure: false,
        },
      ],
    },
  ];
};

/** The finished parts of a reply, in order. */
export const finishedParts = (events: ReadonlyArray<ModelEvent>) =>
  events.flatMap((event) => (event.type === "part-end" ? [event.part] : []));
