/** Liminal's model request as an `effect/ai` prompt and toolkit. */

import { Effect, FileSystem, Option, Predicate, Schema } from "effect";
import { type Prompt, type Response, Tool, Toolkit } from "effect/ai";

import { ModelError, type ModelContent, type ModelPart, type ModelTool } from "@liminal/sdk";

/** What a Codex reply part keeps for the next request: its item id and encrypted reasoning. */
export const CodexData = Schema.Struct({
  openai: Schema.Struct({
    itemId: Schema.optionalKey(Schema.NullOr(Schema.String)),
    encryptedContent: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
});

export type CodexData = typeof CodexData.Type;

const decodeData = Schema.decodeUnknownOption(CodexData);

/** The Codex data in a reply part's metadata, or none. */
export const codexData = (
  metadata: Response.ProviderMetadata | Readonly<Record<string, Schema.Json>>,
): CodexData | Record<string, never> => Option.getOrElse(decodeData(metadata), () => ({}));

/** The part options the OpenAI protocol reads back, from a part's provider data. */
const optionsOf = (part: Extract<ModelPart, { providerData: unknown }>) =>
  codexData(part.providerData);

type ToolChangePart = Extract<ModelPart, { type: "tool-change" }>;

/** A tool offer or withdrawal as text, for a provider that sends every tool from the start. */
const toolChangeText = ({ change, tool }: ToolChangePart) =>
  change === "offer"
    ? `The tool \`${tool.name}\` is available from now on.`
    : `The tool \`${tool.name}\` is no longer available; do not call it.`;

const systemText = (parts: ReadonlyArray<ModelPart>) =>
  parts
    .flatMap((part) => {
      if (part.type === "text") return [part.text];
      if (part.type === "tool-change") return [toolChangeText(part)];

      return [];
    })
    .join("\n\n");

const userParts = Effect.fn("Codex.userParts")(function* (parts: ReadonlyArray<ModelPart>) {
  const fs = yield* FileSystem.FileSystem;
  const content: Array<Prompt.UserMessagePartEncoded> = [];

  for (const part of parts) {
    if (part.type === "text") content.push({ type: "text", text: part.text });

    if (part.type === "image") {
      const data = yield* fs
        .readFile(part.path)
        .pipe(
          Effect.mapError(
            (error) =>
              new ModelError({
                reason: "invalid-request",
                message: `Cannot read image: ${error.message}`,
              }),
          ),
        );

      content.push({ type: "file", mediaType: part.mediaType, data });
    }
  }

  return content;
});

const assistantParts = (parts: ReadonlyArray<ModelPart>) =>
  parts.flatMap((part): ReadonlyArray<Prompt.AssistantMessagePartEncoded> => {
    if (part.type === "text" || part.type === "reasoning") {
      return [{ type: part.type, text: part.text, options: optionsOf(part) }];
    }

    if (part.type === "tool-call") {
      return [
        {
          type: "tool-call",
          id: part.id,
          name: part.name,
          params: part.params,
          options: optionsOf(part),
        },
      ];
    }

    return [];
  });

const toolParts = (parts: ReadonlyArray<ModelPart>) =>
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

const message = Effect.fn("Codex.message")(function* (content: ModelContent) {
  const { role, parts } = content;

  if (role === "system")
    return { role, content: systemText(parts) } satisfies Prompt.MessageEncoded;

  if (role === "user")
    return { role, content: yield* userParts(parts) } satisfies Prompt.MessageEncoded;

  if (role === "assistant")
    return { role, content: assistantParts(parts) } satisfies Prompt.MessageEncoded;

  return { role, content: toolParts(parts) } satisfies Prompt.MessageEncoded;
});

/** The request's messages as prompt messages, reading images from disk. */
export const promptOf = (messages: ReadonlyArray<ModelContent>) =>
  Effect.forEach(messages, message);

const isSchemaObject = (value: Schema.Json): value is { readonly [key: string]: Schema.Json } =>
  Predicate.isObject(value) && !Array.isArray(value);

/** A declared tool; its parameters must be a JSON Schema object. */
const dynamicTool = (tool: ModelTool) => {
  const { name, description, parameters } = tool;

  return isSchemaObject(parameters)
    ? Effect.succeed(Tool.dynamic(name, { description, parameters }))
    : Effect.fail(
        new ModelError({
          reason: "invalid-request",
          message: `Tool ${name} has parameters that are not a JSON Schema object`,
        }),
      );
};

/** Every declared tool, offered or not; a later offer arrives as system text. */
export const toolkitOf = Effect.fn("Codex.toolkitOf")(function* (tools: ReadonlyArray<ModelTool>) {
  return Toolkit.make(...(yield* Effect.forEach(tools, dynamicTool)));
});
