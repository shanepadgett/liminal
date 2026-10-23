/**
 * Tool changes on the Messages API: the declared tools stay the request's tools, and each change's
 * system message holds `tool_removal` and `tool_addition` blocks, so the cached prefix holds.
 */
import type { Schema } from "effect";
import { HttpClientRequest } from "effect/http";

import {
  type Fields,
  isFields,
  listOf,
  type ToolChanges,
  type WireTool,
  type WireForm,
  type WireToolChange,
  withdrawnOf,
  withField,
} from "./tool-changes.ts";

const inlineToolsBeta = "inline-tools-2026-09-15";

/**
 * Never offered. Anthropic adds hidden scaffolding for tool changes; declaring a deferred tool from
 * the first request keeps it in the cached prefix, so the first change does not miss the cache, as
 * Pi measured.
 */
const placeholder = {
  name: "liminal_deferred_placeholder",
  description: "Reserved placeholder. Never available. Never call this.",
  input_schema: { type: "object", properties: {}, required: [] },
  defer_loading: true,
};

const toolOf = ({ name, description, input }: WireTool): Schema.Json => ({
  name,
  description,
  input_schema: input,
});

const blocksOf = (change: WireToolChange): ReadonlyArray<Schema.Json> => [
  ...withdrawnOf(change).map((name) => ({
    type: "tool_removal",
    tool: { type: "tool_reference", name },
  })),
  // A definition under a declared name replaces the declared one.
  ...change.added.map((tool) => ({
    type: "tool_addition",
    tool: { type: "tool_definition", definition: toolOf(tool) },
  })),
];

const isSystem = (message: Schema.Json): message is Fields =>
  isFields(message) && message["role"] === "system";

/**
 * `body` with the declared tools and the placeholder, and each change's system text as its blocks;
 * as it is when the system texts do not pair with the changes. Anthropic refuses a tool list of
 * only deferred tools, so with none declared it is left as it is too.
 */
const withToolChanges =
  ({ declared, changes }: ToolChanges) =>
  (body: Fields): Fields => {
    const messages = listOf(body.messages);

    const texts = messages.flatMap((message) =>
      isSystem(message) ? listOf(message["content"]) : [],
    );

    if (declared.length === 0 || texts.length !== changes.length) return body;

    const queue = [...changes];

    const rewritten = messages.map((message) => {
      if (!isSystem(message)) return message;

      const content = listOf(message["content"]).flatMap(() => {
        const change = queue.shift();

        return change === undefined ? [] : blocksOf(change);
      });

      return withField(message, "content", content);
    });

    const tools = [...declared.map(toolOf), placeholder];

    return withField(withField(body, "tools", tools), "messages", rewritten);
  };

/** Adds the inline tools beta to any the request asked for. */
const withBeta = (request: HttpClientRequest.HttpClientRequest) => {
  const requested = request.headers["anthropic-beta"];
  const betas = requested === undefined ? inlineToolsBeta : `${requested},${inlineToolsBeta}`;

  return HttpClientRequest.setHeader(request, "anthropic-beta", betas);
};

export const messagesToolChanges = (toolChanges: ToolChanges): WireForm => ({
  request: withBeta,
  body: withToolChanges(toolChanges),
});
