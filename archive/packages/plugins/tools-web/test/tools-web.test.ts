/**
 * The web tools: `websearch` answers with the first searcher that works and Exa last, and
 * `webfetch` reads a page as text with its links.
 */

import { expect } from "bun:test";

import { Effect, Layer, Ref } from "effect";
import { HttpClient } from "effect/http";

import { PromptSections, ToolSources } from "@liminal/context/contract";
import { KeyedRegistry, ModelError, Registry, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, type Sent, stubHttp, testBaseServices } from "@liminal/sdk/testing";
import tools from "@liminal/tools";
import { type ToolCall, ToolPipeline, Tools } from "@liminal/tools/contract";

import { offerSearchers, providerSearcher, SearchFailed, WebSearchers } from "../src/contract.ts";
import { webLayer } from "../src/server.ts";

const exaText = [
  "Title: Effect docs",
  "URL: https://effect.website/docs",
  "Text: Effect is a TypeScript library.",
].join("\n");

const page = [
  "<html><head><title>Hi</title><script>alert(1)</script></head><body>",
  '<h1>Hello &amp; welcome</h1><p>Read <a href="https://example.com/more">more</a>.</p>',
  "</body></html>",
].join("");

const reply = (url: URL) => {
  if (url.hostname === "mcp.exa.ai") {
    const json = JSON.stringify({ result: { content: [{ type: "text", text: exaText }] } });

    return new Response(`event: message\ndata: ${json}\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  }

  if (url.pathname.endsWith(".png")) {
    return new Response("png", { headers: { "content-type": "image/png" } });
  }

  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
};

const http = Layer.effect(
  HttpClient.HttpClient,
  Effect.map(Ref.make<ReadonlyArray<Sent>>([]), (sent) => stubHttp(sent, reply)),
);

const stack = webLayer.pipe(
  Layer.provide(http),
  Layer.provideMerge(serverOf(tools)),
  Layer.provideMerge(
    Layer.mergeAll(
      KeyedRegistry.layer(PromptSections, (section) => section.key),
      Registry.layer(ToolSources),
    ),
  ),
  Layer.provideMerge(testBaseServices),
);

const call = (name: string, params: ToolCall["params"]) =>
  Effect.gen(function* () {
    const registry = yield* Tools;
    const each: ToolCall = { sessionId: SessionId.make("s1"), callId: "c1", name, params };

    return yield* (yield* ToolPipeline).run(each, yield* registry.get(name));
  });

const resultOf = (outcome: Effect.Success<ReturnType<typeof call>>) =>
  outcome.status === "done" ? JSON.stringify(outcome.output.result) : outcome.message;

effectTest(
  "a search falls through a failing searcher to the next that answers",
  Effect.gen(function* () {
    yield* offerSearchers([
      providerSearcher("Down", () =>
        Effect.fail(new ModelError({ reason: "auth", message: "no login" })),
      ),
      providerSearcher("Up", (query) =>
        Effect.succeed({
          text: `About ${query.query}`,
          sources: [{ url: "https://a.example", title: "A" }],
        }),
      ),
    ]);

    const outcome = yield* call("websearch", { query: "effect" });

    expect(outcome.status).toBe("done");
    expect(resultOf(outcome)).toContain("About effect");
    expect(resultOf(outcome)).toContain("- [A](https://a.example)");
    expect(resultOf(outcome)).toContain("Searched with Up.");
  }).pipe(Effect.scoped),
  stack,
);

effectTest(
  "Exa answers last, its sources read from its text",
  Effect.gen(function* () {
    yield* (yield* WebSearchers).register(
      { name: "Down", search: () => Effect.fail(new SearchFailed({ message: "no" })) },
      { order: 0 },
    );

    const outcome = yield* call("websearch", { query: "effect", maxSources: 3 });

    expect(resultOf(outcome)).toContain("- [Effect docs](https://effect.website/docs)");
    expect(resultOf(outcome)).toContain("Searched with Exa.");
  }).pipe(Effect.scoped),
  stack,
);

effectTest(
  "a fetched page reads as text with its links, and a picture fails",
  Effect.gen(function* () {
    const outcome = yield* call("webfetch", { url: "https://example.com/" });

    expect(resultOf(outcome)).toContain("Hello & welcome");
    expect(resultOf(outcome)).toContain("more (https://example.com/more)");
    expect(resultOf(outcome)).not.toContain("alert");

    const picture = yield* call("webfetch", { url: "https://example.com/a.png" });
    expect(picture.status).toBe("failed");
    expect(resultOf(picture)).toContain("image/png");
  }).pipe(Effect.scoped),
  stack,
);
