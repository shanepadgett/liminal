/** `cancel/turn` on the scripted provider: it ends a running turn as cancelled. */

import { expect } from "bun:test";

import { Effect, Latch, Layer } from "effect";
import { RpcTest } from "effect/rpc";
import { TestClock } from "effect/testing";

import agentLoop from "@liminal/agent-loop";
import { AgentLoop, TurnEndedEntry } from "@liminal/agent-loop/contract";
import context from "@liminal/context";
import modelScripted from "@liminal/model-scripted";
import { replyText, ScriptedModel, scriptedProvider } from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import { SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, userMessage } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";
import toolPipeline from "@liminal/tool-pipeline";
import toolRegistry from "@liminal/tool-registry";

import cancel from "../plugin.ts";
import { CancelRpcs } from "../src/contract.ts";

const stack = serverOf(cancel).pipe(
  Layer.provideMerge(serverOf(agentLoop)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(toolPipeline)),
  Layer.provideMerge(serverOf(toolRegistry)),
  Layer.provideMerge(serverOf(modelScripted)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(serverOf(settingsPlugin)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

effectTest(
  "cancel/turn ends the running turn as cancelled",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    const gate = yield* Latch.make();
    yield* log.create(s1);
    yield* (yield* ScriptedModel).enqueue([{ type: "gate", gate }, ...replyText("never")]);
    yield* log.append(s1, [userMessage("go")]);

    yield* (yield* AgentLoop).start(s1, {
      model: { provider: scriptedProvider, id: "scripted" },
      thinking: "medium",
    });

    // Lets the turn reach its model call, held at the gate.
    yield* TestClock.adjust("50 millis");

    const client = yield* RpcTest.makeClient(CancelRpcs);
    yield* client["cancel/turn"]({ session: s1 });

    const ended = yield* log.lastOfKinds([TurnEndedEntry]);
    expect(ended).toMatchObject([{ sessionId: s1, data: { end: "cancelled" } }]);
  }),
  stack,
);
