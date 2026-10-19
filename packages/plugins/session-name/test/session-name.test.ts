/**
 * Session name: `name_session` names a session once, a repeat call is denied, a bad name fails, and
 * the session list shows the name, or the first user message while there is none.
 */

import { expect } from "bun:test";

import { Effect, Layer } from "effect";

import { PromptSections, ToolSources } from "@liminal/context/contract";
import { KeyedRegistry, Registry, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, userMessage } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import tools from "@liminal/tools";
import { type ToolCall, ToolPipeline, Tools } from "@liminal/tools/contract";

import sessionName from "../plugin.ts";
import { nameTool } from "../src/contract.ts";

const stack = serverOf(sessionName).pipe(
  Layer.provideMerge(serverOf(tools)),
  Layer.provideMerge(
    Layer.mergeAll(
      KeyedRegistry.layer(PromptSections, (section) => section.key),
      Registry.layer(ToolSources),
    ),
  ),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

const call = (name: string, callId: string) =>
  Effect.gen(function* () {
    const registry = yield* Tools;

    const each: ToolCall = { sessionId: s1, callId, name: nameTool, params: { name } };

    return yield* (yield* ToolPipeline).run(each, yield* registry.get(nameTool));
  });

const titles = Effect.gen(function* () {
  const sessions = yield* (yield* SessionLog).list;

  return sessions.map((session) => session.title);
});

effectTest(
  "naming a session replaces its first user message in the list",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);
    yield* log.append(s1, [userMessage("fix the login bug\nit loops")]);
    expect(yield* titles).toEqual(["fix the login bug"]);

    const outcome = yield* call("Fixing a login redirect loop", "c1");
    expect(outcome.status).toBe("done");
    expect(yield* titles).toEqual(["Fixing a login redirect loop"]);
  }),
  stack,
);

effectTest(
  "a second call is denied and keeps the first name",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);
    yield* call("First name", "c1");

    const outcome = yield* call("Second name", "c2");
    expect(outcome.status).toBe("denied");
    expect(outcome.status === "denied" ? outcome.message : "").toContain("already has a name");
    expect(yield* titles).toEqual(["First name"]);
  }),
  stack,
);

effectTest(
  "a name with a line break, or over 80 characters, fails",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);

    expect((yield* call("two\nlines", "c1")).status).toBe("failed");
    expect((yield* call("x".repeat(81), "c2")).status).toBe("failed");
    expect(yield* titles).toEqual([""]);

    expect((yield* call("Fine after two failures", "c3")).status).toBe("done");
  }),
  stack,
);
