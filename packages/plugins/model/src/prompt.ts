/** Liminal's messages and tools as Effect AI's prompt and toolkit, and its parts back as deltas. */
import { type Prompt, Response, Tool, Toolkit } from "effect/ai";

import type { Image, Message, ModelRequest, Part, ToolDefinition, ToolResult } from "./contract.ts";

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

const imagesOf = (result: ToolResult) =>
  result.content.flatMap((part) => (part.type === "image" ? [part] : []));

/**
 * A result's text parts as one string, as every wire takes a result; its images are named, as they
 * follow the run of results or are left out.
 */
const resultText = (result: ToolResult, images: boolean) => {
  const texts = result.content.flatMap((part) => (part.type === "text" ? [part.text] : []));
  const count = imagesOf(result).length;
  if (count === 0) return texts.join("\n");

  const note = images
    ? `[${count} image(s) attached after the tool results]`
    : `[${count} image(s) left out: this model does not take images]`;

  return [...texts, note].join("\n");
};

const toolParts = (parts: ReadonlyArray<Part>, images: boolean) =>
  parts.flatMap((part): ReadonlyArray<Prompt.ToolMessagePartEncoded> =>
    part.type === "tool-result"
      ? [
          {
            type: "tool-result",
            id: part.callId,
            name: part.name,
            isFailure: part.isFailure,
            result: resultText(part, images),
          },
        ]
      : [],
  );

const messageOf = ({ role, parts }: Message, images: boolean): Prompt.MessageEncoded => {
  if (role === "user") return { role, content: userParts(parts) };
  if (role === "assistant") return { role, content: assistantParts(parts) };

  return { role, content: toolParts(parts, images) };
};

/** The images of the run of tool messages that ends at `end`. */
const runImages = (messages: ReadonlyArray<Message>, end: number): ReadonlyArray<Image> => {
  const start = messages.findLastIndex((message, index) => index < end && message.role !== "tool");

  return messages
    .slice(start + 1, end + 1)
    .flatMap(({ parts }) =>
      parts.flatMap((part) => (part.type === "tool-result" ? imagesOf(part) : [])),
    );
};

/**
 * The images of a run of tool results as one user message after the run: the wires take a result
 * only as a string, and Chat Completions takes no user message between tool messages.
 */
const imagesAfter = (
  messages: ReadonlyArray<Message>,
  index: number,
): ReadonlyArray<Prompt.MessageEncoded> => {
  if (messages[index]?.role !== "tool" || messages[index + 1]?.role === "tool") return [];

  const images = runImages(messages, index);
  if (images.length === 0) return [];

  const label: Part = { type: "text", text: "Images from the tool results above:" };

  return [{ role: "user", content: userParts([label, ...images]) }];
};

/**
 * The system prompt, then each message; tool results' images follow their run, or are left out when
 * the model takes none.
 */
export const promptOf = (
  request: ModelRequest,
  images: boolean,
): ReadonlyArray<Prompt.MessageEncoded> => [
  ...(request.system === "" ? [] : [{ role: "system" as const, content: request.system }]),
  ...request.messages.flatMap((message, index) => [
    messageOf(message, images),
    ...(images ? imagesAfter(request.messages, index) : []),
  ]),
];

/** The tools as Effect AI tools with JSON Schema params; nothing runs them here. */
export const toolkitOf = (tools: ReadonlyArray<ToolDefinition>) =>
  Toolkit.make(
    ...tools.map(({ name, description, input }) =>
      Tool.dynamic(name, { description, parameters: input }),
    ),
  );

/** An OpenAI entry without a null `encryptedContent`, which end parts do not take. */
const endEntry = <Entry extends { readonly encryptedContent?: string | null | undefined }>(
  entry: Entry | null,
) => {
  if (entry === null) return null;

  const { encryptedContent, ...rest } = entry;

  return encryptedContent === null || encryptedContent === undefined
    ? rest
    : { ...rest, encryptedContent };
};

/** A reasoning part's metadata for its end part, where OpenAI's encrypted content is not null. */
const reasoningEndOf = ({
  openai,
  "openai-compat": compat,
  ...others
}: Response.ReasoningPartMetadata): Response.ReasoningEndPartMetadata => {
  const withOpenai = openai === undefined ? others : { ...others, openai: endEntry(openai) };

  return compat === undefined ? withOpenai : { ...withOpenai, "openai-compat": endEntry(compat) };
};

/** A whole reply's parts as the deltas a stream would have sent. */
export const replay = (parts: ReadonlyArray<Response.AnyPart>): ReadonlyArray<Response.AnyPart> =>
  parts.flatMap((part, index): ReadonlyArray<Response.AnyPart> => {
    const id = String(index);

    if (part.type === "text") {
      return [
        Response.makePart("text-start", { id }),
        Response.makePart("text-delta", { id, delta: part.text }),
        Response.makePart("text-end", { id, metadata: part.metadata }),
      ];
    }

    if (part.type === "reasoning") {
      return [
        Response.makePart("reasoning-start", { id }),
        Response.makePart("reasoning-delta", { id, delta: part.text }),
        Response.makePart("reasoning-end", { id, metadata: reasoningEndOf(part.metadata) }),
      ];
    }

    return [part];
  });
