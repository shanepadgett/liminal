/**
 * Where a request's cached prefixes end. Anthropic caches tools, then system, then messages, so the
 * first system message also caches the tools; the last system message and the last message let a
 * growing conversation reuse what the previous request wrote.
 */

import type { ContextRequest } from "@liminal/context/contract";
import type { ModelContent } from "@liminal/sdk";

const isSystem = (message: ModelContent) => message.role === "system";

/** The positions to mark: the first and last system messages and the last message. */
const markedIndexes = (messages: ReadonlyArray<ModelContent>) =>
  new Set(
    [messages.findIndex(isSystem), messages.findLastIndex(isSystem), messages.length - 1].filter(
      (index) => index >= 0,
    ),
  );

/** `request` with a cache mark on each position that ends a reusable prefix. */
export const marksOf = (request: ContextRequest): ContextRequest => {
  const marked = markedIndexes(request.messages);

  return {
    ...request,
    messages: request.messages.map((message, index): ModelContent =>
      marked.has(index)
        ? { role: message.role, parts: message.parts, cache: "breakpoint" }
        : message,
    ),
  };
};
