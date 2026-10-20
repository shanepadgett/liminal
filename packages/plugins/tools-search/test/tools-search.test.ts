/**
 * Tool search: `tool_search` loads deferred tools by name or by keywords, ranked by this project's
 * use with older calls weighing less; the result carries the loads into the next request; the
 * prompt lists the deferred tools within a budget and tells only of added ones.
 */

import { expect } from "bun:test";

import { Duration, Effect, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";

import agentLoop from "@liminal/agent-loop";
import { AgentLoop } from "@liminal/agent-loop/contract";
import context from "@liminal/context";
import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import {
  reply,
  replyText,
  ScriptedModel,
  scriptedProvider,
} from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import {
  defineTool,
  draft,
  type ModelContent,
  type ModelPart,
  type ModelRequest,
  SessionId,
} from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, ToolCallEntry, userMessage } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";
import tools from "@liminal/tools";
import { Tools } from "@liminal/tools/contract";

import toolsSearch from "../plugin.ts";

const stack = serverOf(toolsSearch).pipe(
  Layer.provideMerge(serverOf(agentLoop)),
  Layer.provideMerge(serverOf(tools)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(modelScripted)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(serverOf(modelCatalog)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(serverOf(settingsPlugin)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

/** An earlier session whose calls count as use. */
const s0 = SessionId.make("s0");

const settings = {
  model: { provider: scriptedProvider, id: "scripted" },
  thinking: "off",
} as const;

const deferred = (name: string, description: string) =>
  defineTool({
    name,
    description,
    parameters: Schema.Struct({}),
    offer: "search",
    runAlongside: true,
    safeToRerun: true,
    run: () => Effect.succeed({ result: name }),
  });

const search = (query: string, limit?: number): ModelPart => ({
  type: "tool-call",
  id: "c1",
  name: "tool_search",
  params: limit === undefined ? { query } : { query, limit },
  providerData: {},
});

/** Runs a turn whose model searches with `query` once, then answers; gives the model's requests. */
const searchTurn = Effect.fn("searchTurn")(function* (
  query: string,
  options: { readonly limit?: number } = {},
) {
  const log = yield* SessionLog;
  const scripted = yield* ScriptedModel;
  yield* log.create(s1);
  yield* log.append(s1, [userMessage("find a tool")]);

  yield* scripted.enqueue(
    reply([search(query, options.limit)], { reason: "tool-calls" }),
    replyText("done"),
  );

  yield* (yield* AgentLoop).run(s1, settings);

  return yield* scripted.requests;
});

const toolMessage = (request: ModelRequest | undefined) =>
  request?.messages.find((message: ModelContent) => message.role === "tool")?.parts[0];

/** Saves `count` calls of `name` in the earlier session, made now. */
const used = Effect.fn("used")(function* (name: string, count: number) {
  const log = yield* SessionLog;

  const calls = Array.from({ length: count }, (_, index) =>
    draft(ToolCallEntry, {
      data: { id: `${name}-${index}`, name, params: {} },
      model: [
        {
          role: "assistant",
          parts: [
            { type: "tool-call", id: `${name}-${index}`, name, params: {}, providerData: {} },
          ],
        },
      ],
      text: name,
    }),
  );

  const [first, ...rest] = calls;
  if (first !== undefined) yield* log.append(s0, [first, ...rest]);
});

const systemText = (request: ModelRequest | undefined) =>
  (request?.messages ?? [])
    .flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
    )
    .join("\n");

effectTest(
  "select loads the named deferred tools, and the next request's result carries the loads",
  Effect.gen(function* () {
    const registry = yield* Tools;
    yield* registry.register(deferred("lookup", "Looks up a word."));

    const [first, second] = yield* searchTurn("select:lookup, nope");

    expect(first?.tools.find((tool) => tool.name === "lookup")).toMatchObject({
      offered: true,
      deferred: true,
    });

    expect(toolMessage(second)).toMatchObject({
      type: "tool-result",
      name: "tool_search",
      loads: ["lookup"],
      result:
        "Loaded these tools; call them directly:\n- lookup: Looks up a word.\nNo deferred tool is named: nope",
    });
  }),
  stack,
);

effectTest(
  "keywords rank often used tools first, an old call weighing half as much every 30 days",
  Effect.gen(function* () {
    const registry = yield* Tools;
    yield* registry.register(deferred("fetch_page", "Reads a web page as text."));
    yield* registry.register(deferred("read_page", "Reads a web page as text."));
    yield* (yield* SessionLog).create(s0);

    // Three calls 60 days old weigh 0.75, under one call made today.
    yield* used("read_page", 3);
    yield* TestClock.adjust(Duration.days(60));
    yield* used("fetch_page", 1);

    const [, second] = yield* searchTurn("web page", { limit: 1 });

    expect(toolMessage(second)).toMatchObject({ loads: ["fetch_page"] });
  }),
  stack,
);

effectTest(
  "keywords match no tool through a stop word such as the",
  Effect.gen(function* () {
    const registry = yield* Tools;
    yield* registry.register(deferred("web_search", "Searches the web for pages."));
    yield* registry.register(deferred("web_fetch", "Reads a web page as text."));
    yield* registry.register(deferred("terms", "Reads and changes the project's terms."));

    const [, second] = yield* searchTurn("search the web");

    expect(toolMessage(second)).toMatchObject({ loads: ["web_search", "web_fetch"] });
  }),
  stack,
);

effectTest(
  "a search that matches nothing loads nothing",
  Effect.gen(function* () {
    yield* (yield* Tools).register(deferred("lookup", "Looks up a word."));

    const [, second] = yield* searchTurn("spreadsheet");
    const part = toolMessage(second);

    expect(part).toMatchObject({ result: 'No deferred tool matches "spreadsheet".' });
    expect(part).not.toHaveProperty("loads");
  }),
  stack,
);

effectTest(
  "the prompt lists deferred tools within its budget, then tells only of added ones",
  Effect.gen(function* () {
    const registry = yield* Tools;
    const long = "Does one rare thing with a description long enough to fill its line. ".repeat(3);

    for (let index = 0; index < 60; index += 1) {
      yield* registry.register(deferred(`rare_${String(index).padStart(2, "0")}`, long));
    }

    const log = yield* SessionLog;
    const scripted = yield* ScriptedModel;
    const loop = yield* AgentLoop;
    yield* log.create(s1);
    yield* log.append(s1, [userMessage("hello")]);
    yield* scripted.enqueue(replyText("one"), replyText("two"), replyText("three"));
    yield* loop.run(s1, settings);

    const text = systemText((yield* scripted.requests)[0]);

    expect(text).toContain("Deferred tools: load one with `tool_search` before calling it");
    expect(text).toContain("- rare_00: Does one rare thing with a description long enough");
    expect(text).toMatch(/\n\d+ more; find them with tool_search/);

    yield* log.append(s1, [userMessage("again")]);
    yield* loop.run(s1, settings);
    expect(systemText((yield* scripted.requests)[1])).not.toContain("New deferred tools");

    yield* registry.register(deferred("added_tool", "Arrived later."));
    yield* log.append(s1, [userMessage("more")]);
    yield* loop.run(s1, settings);

    expect(systemText((yield* scripted.requests)[2])).toContain(
      "New deferred tools:\n- added_tool: Arrived later.",
    );
  }),
  stack,
);
