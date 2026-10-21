/** System-prompt: the base prompt leads the first request's system message. */

import { expect } from "bun:test";

import { Context as EffectContext, Effect, Layer, Schema } from "effect";

import context from "@liminal/context";
import { Context } from "@liminal/context/contract";
import { defineEntry, draft, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";

import systemPrompt from "../plugin.ts";
import { basePrompt } from "../src/server/base.ts";

const stack = serverOf(systemPrompt).pipe(
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
);

const Prompt = defineEntry({
  kind: "test/prompt",
  data: Schema.String,
  model: true,
  user: "shown",
});

effectTest(
  "the base prompt is the system message's first text",
  Effect.gen(function* () {
    const services = yield* Layer.build(stack);
    const log = EffectContext.get(services, SessionLog);
    const s1 = SessionId.make("s1");
    yield* log.create(s1);

    yield* log.append(s1, [
      draft(Prompt, {
        data: "hi",
        model: [{ role: "user", parts: [{ type: "text", text: "hi", providerData: {} }] }],
        text: "hi",
      }),
    ]);

    const request = yield* EffectContext.get(services, Context).build(s1, {
      provider: "scripted",
      id: "scripted",
    });

    expect(request.messages[0]).toEqual({
      role: "system",
      parts: [{ type: "text", text: basePrompt, providerData: {} }],
    });
  }),
  testBaseServices,
);
