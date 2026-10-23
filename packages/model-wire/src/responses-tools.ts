/**
 * Tool changes on the Responses API. An `additional_tools` item cannot replace a top-level tool or
 * remove one, so as in Pi every tool goes in these items: the declared tools at the head of the
 * input, each change's added tools at its point, and a withdrawal as a note.
 */
import type { Schema } from "effect";

import {
  type Fields,
  isFields,
  listOf,
  type ToolChanges,
  type WireTool,
  type WireForm,
  type WireToolChange,
  withdrawnOf,
} from "./tool-changes.ts";

/**
 * Before every item after the first: without it, models read the latest item as every tool once a
 * removal was announced. Pi's wording, which it verified in October 2026.
 */
const incrementalNotice = (unavailable: ReadonlySet<string>) => {
  const notice =
    "This is an incremental tools update. Previously declared tools remain available unless explicitly marked unavailable. A tool declared again here is available again, and its latest definition replaces the earlier one.";

  return unavailable.size > 0
    ? `${notice}\nStill unavailable: ${[...unavailable].join(", ")}.`
    : notice;
};

const removalNotice = (names: ReadonlyArray<string>) =>
  `The following tools are no longer available. Do not call them:\n${names.map((name) => `- ${name}`).join("\n")}`;

const developer = (text: string): Schema.Json => ({
  role: "developer",
  content: [{ type: "input_text", text }],
});

const toolOf = ({ name, description, input }: WireTool): Schema.Json => ({
  type: "function",
  name,
  description,
  parameters: input,
  strict: false,
});

const toolsItem = (tools: ReadonlyArray<WireTool>): Schema.Json => ({
  type: "additional_tools",
  role: "developer",
  tools: tools.map(toolOf),
});

const isInstruction = (item: Schema.Json) =>
  isFields(item) && (item.role === "system" || item.role === "developer");

/** One change's items, and the tools unavailable after it. */
const changeItems = (change: WireToolChange, unavailable: ReadonlySet<string>) => {
  const withdrawn = withdrawnOf(change);
  const added = new Set(change.added.map(({ name }) => name));
  const after = new Set([...[...unavailable].filter((name) => !added.has(name)), ...withdrawn]);

  const items = [
    ...(withdrawn.length > 0 ? [developer(removalNotice(withdrawn))] : []),
    ...(change.added.length > 0
      ? [developer(incrementalNotice(after)), toolsItem(change.added)]
      : []),
  ];

  return { items, unavailable: after };
};

/**
 * `body` with no top-level tools, the declared tools in an item after the leading instructions, and
 * each change's instruction as its items; as it is when the instructions do not pair with the
 * changes.
 */
const withToolChanges =
  ({ declared, changes }: ToolChanges) =>
  (body: Fields): Fields => {
    const input = listOf(body.input);
    const start = input.findIndex((item) => !isInstruction(item));
    const head = start < 0 ? input : input.slice(0, start);
    const rest = start < 0 ? [] : input.slice(start);
    if (rest.filter(isInstruction).length !== changes.length) return body;

    let unavailable: ReadonlySet<string> = new Set();
    let next = 0;

    const items = rest.flatMap((item) => {
      const change = isInstruction(item) ? changes[next] : undefined;
      if (change === undefined) return [item];

      next += 1;
      const changed = changeItems(change, unavailable);
      unavailable = changed.unavailable;

      return changed.items;
    });

    const others = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "tools"));
    const declaredItem = declared.length > 0 ? [toolsItem(declared)] : [];

    return { ...others, input: [...head, ...declaredItem, ...items] };
  };

export const responsesToolChanges = (toolChanges: ToolChanges): WireForm => ({
  request: (request) => request,
  body: withToolChanges(toolChanges),
});
