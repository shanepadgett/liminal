/**
 * Session name: `name_session` names a session once, a repeat call is denied, a bad name fails, and
 * the session list shows the name, or the first user message while there is none.
 */

import { expect } from "bun:test";

import { Effect, Layer, Predicate } from "effect";

import { BeforeCallHooks } from "@liminal/agent-loop/contract";
import { PromptSections, ToolSources } from "@liminal/context/contract";
import { draft, KeyedRegistry, Registry, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import {
  SessionLog,
  ToolCallEntry,
  ToolResultEntry,
  userMessage,
} from "@liminal/session-log/contract";
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
      Registry.layer(BeforeCallHooks),
    ),
  ),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

const beforeCall = (sessionId = s1) =>
  Effect.gen(function* () {
    const hooks = yield* (yield* BeforeCallHooks).list;

    const answers = yield* Effect.forEach(hooks, (hook) =>
      hook({ sessionId, settings: { model: { provider: "test", id: "test" } } }),
    );

    return answers.flatMap((answer) => (Predicate.isTagged(answer, "Proceed") ? answer.input : []));
  });

const completedCall = (id: number) =>
  draft(ToolResultEntry, {
    data: { callId: `c${id}`, name: "read", status: "done", result: "done" },
    text: "done",
    model: [],
  });

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
  "an unnamed session gets one gentle reminder after five completed tool calls across exchanges",
  Effect.gen(function* () {
    const log = yield* SessionLog;

    yield* log.create(s1);
    expect(yield* beforeCall()).toEqual([]);

    yield* log.append(s1, [
      userMessage("Investigate the login bug"),
      ...[1, 2, 3, 4].map(completedCall),
    ]);

    yield* log.append(s1, [
      draft(ToolCallEntry, {
        data: { id: "pending", name: "read", params: {} },
        text: "read",
        model: [],
      }),
    ]);

    expect(yield* beforeCall()).toEqual([]);

    yield* log.append(s1, [userMessage("Check the redirect too"), completedCall(5)]);
    const input = yield* beforeCall();
    expect(input).toHaveLength(1);
    expect(input[0]?.text).toContain("call name_session at a convenient point");
    expect(input[0]?.text).toContain("do not interrupt the work just to name it");
    expect(input[0]?.user).toBe("debug");
    const first = input[0];
    if (first === undefined) return;
    yield* log.append(s1, [first]);
    expect(yield* beforeCall()).toEqual([]);
    yield* log.append(s1, [completedCall(6)]);
    expect(yield* beforeCall()).toEqual([]);

    const s2 = SessionId.make("s2");
    yield* log.create(s2);
    yield* log.append(s2, [completedCall(1), ...[2, 3, 4, 5].map(completedCall)]);
    expect(yield* beforeCall(s2)).toHaveLength(1);
  }),
  stack,
);

effectTest(
  "named sessions do not get a naming reminder",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);
    yield* call("Investigating the login bug", "name");
    yield* log.append(s1, [completedCall(1), ...[2, 3, 4, 5].map(completedCall)]);
    expect(yield* beforeCall()).toEqual([]);
  }),
  stack,
);

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
