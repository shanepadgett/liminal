/** The model's `tool_search`: loads deferred tools by keywords or by name. */

import { Effect } from "effect";

import { defineTool, type Tool, type ToolOutput, type ToolSpec } from "@liminal/sdk";

import { SearchParams, selectPrefix, toolSearchTool } from "../contract.ts";
import { rankTools } from "./rank.ts";
import type { ToolUse } from "./use.ts";

const defaultLimit = 5;

/** The deferred tools among `tools`. */
export const deferredSpecs = (tools: ReadonlyArray<Tool>): ReadonlyArray<ToolSpec> =>
  tools.flatMap((tool) => (tool.offer === "search" ? [tool.spec] : []));

/** The names a `select:` query lists. */
const selectedNames = (query: string) =>
  query
    .slice(selectPrefix.length)
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");

/** The tools `select:` names, and the names that are no deferred tool. */
const selected = (specs: ReadonlyArray<ToolSpec>, query: string) => {
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const names = selectedNames(query);

  return {
    found: names.flatMap((name) => byName.get(name) ?? []),
    unknown: names.filter((name) => !byName.has(name)),
  };
};

/** What the model reads: the loaded tools with their descriptions, then any unknown names. */
const resultText = (
  query: string,
  found: ReadonlyArray<ToolSpec>,
  unknown: ReadonlyArray<string>,
) => {
  const loaded =
    found.length === 0
      ? [`No deferred tool matches "${query}".`]
      : [
          "Loaded these tools; call them directly:",
          ...found.map((spec) => `- ${spec.name}: ${spec.description}`),
        ];

  const missing = unknown.length === 0 ? [] : [`No deferred tool is named: ${unknown.join(", ")}`];

  return [...loaded, ...missing].join("\n");
};

/** The output for the tools a search found; they load from the next request. */
const outputOf = (
  query: string,
  found: ReadonlyArray<ToolSpec>,
  unknown: ReadonlyArray<string>,
): ToolOutput => {
  const names = found.map((spec) => spec.name);

  return { result: resultText(query, found, unknown), details: { loaded: names }, loads: names };
};

export const toolSearchToolOf = (
  tools: Effect.Effect<ReadonlyArray<Tool>>,
  use: Effect.Effect<ToolUse>,
) =>
  defineTool({
    name: toolSearchTool,
    description:
      "Finds deferred tools and loads them, so you can call them. Search with keywords, or load tools by name with `select:a,b`.",
    parameters: SearchParams,
    hints: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    runAlongside: true,
    safeToRerun: true,
    run: ({ query, limit = defaultLimit }) =>
      Effect.gen(function* () {
        const specs = deferredSpecs(yield* tools);

        if (query.startsWith(selectPrefix)) {
          const { found, unknown } = selected(specs, query);

          return outputOf(query, found, unknown);
        }

        return outputOf(query, rankTools(specs, query, yield* use, limit), []);
      }),
  });
