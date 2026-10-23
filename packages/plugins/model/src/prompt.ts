/** Liminal's messages and tools as Effect AI's prompt and toolkit, and its parts back as deltas. */
import { type Prompt, Response, Tool, Toolkit } from "effect/ai";

import type {
  Image,
  Message,
  ModelRequest,
  Part,
  ToolChange,
  ToolDefinition,
  ToolResult,
} from "./contract.ts";

/** A tool change as the model reads it where the provider has no form of its own. */
const changeText = ({ added, removed }: ToolChange) => {
  const lines = [
    ...(added.length > 0
      ? [
          `Tools added or changed: ${added.map(({ name }) => name).join(", ")}. Their definitions are in your tool list.`,
        ]
      : []),
    ...(removed.length > 0 ? [`Tools removed: ${removed.join(", ")}. Do not call them.`] : []),
  ];

  return `<tool-update>\n${lines.join("\n")}\n</tool-update>`;
};

/** A user message's parts; a tool change is a note unless it goes as a system message. */
const userParts = (parts: ReadonlyArray<Part>, isNative: boolean) =>
  parts.flatMap((part): ReadonlyArray<Prompt.UserMessagePartEncoded> => {
    if (part.type === "text") return [{ type: "text", text: part.text }];

    if (part.type === "image")
      return [{ type: "file", mediaType: part.mediaType, data: part.data }];

    if (part.type === "tool-change" && !isNative) return [{ type: "text", text: changeText(part) }];

    return [];
  });

const changesOf = (parts: ReadonlyArray<Part>) =>
  parts.flatMap((part) => (part.type === "tool-change" ? [part] : []));

/** A user message, then each of its tool changes as a system message when they go natively. */
const userMessages = (
  parts: ReadonlyArray<Part>,
  isNative: boolean,
): ReadonlyArray<Prompt.MessageEncoded> => {
  const content = userParts(parts, isNative);
  const user = content.length === 0 ? [] : [{ role: "user" as const, content }];
  if (!isNative) return user;

  return [
    ...user,
    ...changesOf(parts).map((change) => ({ role: "system" as const, content: changeText(change) })),
  ];
};

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

/** How a request is sent: whether the model takes images, and tool changes natively. */
export interface PromptOptions {
  readonly images: boolean;
  readonly isNative: boolean;
}

const messagesOf = (
  { role, parts }: Message,
  { images, isNative }: PromptOptions,
): ReadonlyArray<Prompt.MessageEncoded> => {
  if (role === "user") return userMessages(parts, isNative);
  if (role === "assistant") return [{ role, content: assistantParts(parts) }];

  return [{ role, content: toolParts(parts, images) }];
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

  return [{ role: "user", content: userParts([label, ...images], false) }];
};

/**
 * The system prompt, then each message; tool results' images follow their run, or are left out when
 * the model takes none.
 */
export const promptOf = (
  request: ModelRequest,
  options: PromptOptions,
): ReadonlyArray<Prompt.MessageEncoded> => [
  ...(request.system === "" ? [] : [{ role: "system" as const, content: request.system }]),
  ...request.messages.flatMap((message, index) => [
    ...messagesOf(message, options),
    ...(options.images ? imagesAfter(request.messages, index) : []),
  ]),
];

/** The request's tool changes in order. */
export const toolChangesOf = (request: ModelRequest) =>
  request.messages.flatMap(({ role, parts }) => (role === "user" ? changesOf(parts) : []));

/**
 * The declared tools after every change: an added tool replaces one of its name or comes last, and
 * a removed one stays until the list is declared again, so the model sees each change once.
 */
export const toolsAfterChanges = (request: ModelRequest): ReadonlyArray<ToolDefinition> => {
  const byName = new Map(request.tools.map((tool) => [tool.name, tool]));

  for (const { added } of toolChangesOf(request)) {
    for (const tool of added) byName.set(tool.name, tool);
  }

  return [...byName.values()];
};

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
