/** Liminal's messages and tools as Effect AI's prompt and toolkit, and its parts back as deltas. */
import { type Prompt, Response, Tool, Toolkit } from "effect/ai";

import type { Message, ModelRequest, Part, ToolDefinition } from "./contract.ts";

const userParts = (parts: ReadonlyArray<Part>) =>
  parts.flatMap((part): ReadonlyArray<Prompt.UserMessagePartEncoded> => {
    if (part.type === "text") return [{ type: "text", text: part.text }];

    if (part.type === "image")
      return [{ type: "file", mediaType: part.mediaType, data: part.data }];

    return [];
  });

const assistantParts = (parts: ReadonlyArray<Part>) =>
  parts.flatMap((part): ReadonlyArray<Prompt.AssistantMessagePartEncoded> => {
    if (part.type === "text" || part.type === "reasoning") {
      return [{ type: part.type, text: part.text, options: part.providerData }];
    }

    if (part.type === "tool-call") {
      const { id, name, params, providerData } = part;

      return [{ type: "tool-call", id, name, params, options: providerData }];
    }

    return [];
  });

const toolParts = (parts: ReadonlyArray<Part>) =>
  parts.flatMap((part): ReadonlyArray<Prompt.ToolMessagePartEncoded> =>
    part.type === "tool-result"
      ? [
          {
            type: "tool-result",
            id: part.callId,
            name: part.name,
            isFailure: part.isFailure,
            result: part.result,
          },
        ]
      : [],
  );

const messageOf = ({ role, parts }: Message): Prompt.MessageEncoded => {
  if (role === "user") return { role, content: userParts(parts) };
  if (role === "assistant") return { role, content: assistantParts(parts) };

  return { role, content: toolParts(parts) };
};

/** The system prompt, then each message. */
export const promptOf = (request: ModelRequest): ReadonlyArray<Prompt.MessageEncoded> => [
  ...(request.system === "" ? [] : [{ role: "system" as const, content: request.system }]),
  ...request.messages.map(messageOf),
];

/** The tools as Effect AI tools with JSON Schema params; nothing runs them here. */
export const toolkitOf = (tools: ReadonlyArray<ToolDefinition>) =>
  Toolkit.make(
    ...tools.map(({ name, description, input }) =>
      Tool.dynamic(name, { description, parameters: input }),
    ),
  );

/** A whole reply's parts as the deltas a stream would have sent. */
export const replay = (parts: ReadonlyArray<Response.AnyPart>): ReadonlyArray<Response.AnyPart> =>
  parts.flatMap((part, index): ReadonlyArray<Response.AnyPart> => {
    const id = String(index);
    const { metadata } = part;

    if (part.type === "text") {
      return [
        Response.makePart("text-start", { id }),
        Response.makePart("text-delta", { id, delta: part.text }),
        Response.makePart("text-end", { id, metadata }),
      ];
    }

    if (part.type === "reasoning") {
      return [
        Response.makePart("reasoning-start", { id }),
        Response.makePart("reasoning-delta", { id, delta: part.text }),
        Response.makePart("reasoning-end", { id, metadata }),
      ];
    }

    return [part];
  });
