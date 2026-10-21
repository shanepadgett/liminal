/**
 * The `tools-search/deferred` prompt section: each deferred tool by name and one line, most used
 * first, within a budget, so the model knows what `tool_search` can load.
 */

import { Effect, Schema } from "effect";

import { definePromptSection, type SectionRead, wrapped } from "@liminal/context/contract";
import type { Tool, ToolSpec } from "@liminal/sdk";

import { toolSearchTool } from "../contract.ts";
import { deferredSpecs } from "./tool.ts";
import type { ToolUse } from "./use.ts";

/** After tool guidance, before the environment. */
const SECTION_ORDER = 60;

/** About 1,000 tokens at 4 characters per token. */
const budgetCharacters = 4000;

const summaryCharacters = 120;

const Listing = Schema.Array(Schema.Struct({ name: Schema.String, summary: Schema.String }));

type Listing = typeof Listing.Type;

/** The description's first sentence, cut to one short line. */
const summaryOf = (description: string) => {
  const sentence = description.split(/(?<=\.)\s/)[0] ?? description;

  return sentence.length <= summaryCharacters
    ? sentence
    : `${sentence.slice(0, summaryCharacters - 3)}...`;
};

/** The deferred tools, most used first, then by name. */
const listingOf = (specs: ReadonlyArray<ToolSpec>, use: ToolUse): Listing =>
  specs
    .toSorted(
      (left, right) =>
        (use.get(right.name) ?? 0) - (use.get(left.name) ?? 0)
        || left.name.localeCompare(right.name),
    )
    .map((spec) => ({ name: spec.name, summary: summaryOf(spec.description) }));

/** As many lines as fit the budget, then how many more search can find. */
const budgeted = (listing: Listing): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  let used = 0;

  for (const { name, summary } of listing) {
    const line = `- ${name}: ${summary}`;
    if (used + line.length > budgetCharacters) break;

    lines.push(line);
    used += line.length + 1;
  }

  const more = listing.length - lines.length;

  return more === 0 ? lines : [...lines, `${more} more; find them with ${toolSearchTool}`];
};

const missingFrom = (from: Listing, other: Listing) => {
  const kept = new Set(other.map(({ name }) => name));

  return from.filter(({ name }) => !kept.has(name));
};

/** New tools as listed lines, gone ones by name; a change of order alone says nothing. */
const changedText = (before: Listing, after: Listing) => {
  const added = missingFrom(after, before);
  const removed = missingFrom(before, after);

  return [
    ...(added.length === 0 ? [] : [["New deferred tools:", ...budgeted(added)].join("\n")]),
    ...(removed.length === 0
      ? []
      : [`Deferred tools no longer available: ${removed.map(({ name }) => name).join(", ")}`]),
  ].join("\n\n");
};

export const deferredSection = (
  tools: Effect.Effect<ReadonlyArray<Tool>>,
  use: Effect.Effect<ToolUse>,
) =>
  definePromptSection<Listing>({
    key: "tools-search/deferred",
    order: SECTION_ORDER,
    codec: Listing,
    read: () =>
      Effect.gen(function* () {
        const specs = deferredSpecs(yield* tools);
        if (specs.length === 0) return { type: "removed" } satisfies SectionRead<Listing>;

        return {
          type: "present",
          value: listingOf(specs, yield* use),
        } satisfies SectionRead<Listing>;
      }),
    render: {
      initial: (listing) => wrapped("deferred_tools", budgeted(listing).join("\n")),
      changed: changedText,
      removed: () => "No deferred tools are available now.",
    },
  });
