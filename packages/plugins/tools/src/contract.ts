/** The tools the model can call and the one path every tool call takes. */
import { Effect, Schema } from "effect";
import { Tool as AiTool } from "effect/ai";

import { type Attributes, Pipeline, Registry } from "@shanepadgett/liminal-core";
import type {
  Image,
  Text,
  ToolCall as ToolCallPart,
  ToolResult,
} from "@shanepadgett/liminal-model/contract";
import type { SessionId } from "@shanepadgett/liminal-session/contract";

/** What a tool knows about the call it runs. */
export interface ToolContext {
  readonly session: SessionId;
  readonly callId: string;
  /** The attributes of the latest input the turn consumed, such as who sent it. */
  readonly attributes: Attributes;
}

/** A finished call: what the model sees. */
export interface ToolOutput {
  readonly content: ReadonlyArray<Text | Image>;
}

/** A call that failed, such as wrong params; the model sees `message`. */
export class ToolFailed extends Schema.TaggedError<ToolFailed, { readonly brand: unique symbol }>()(
  "ToolFailed",
  { message: Schema.String },
) {}

interface ToolMarks {
  readonly name: string;
  readonly description: string;
  /** Left out of a session's tools until a plugin offers it through `ToolList.offer`. */
  readonly deferred?: boolean | undefined;
  /** Makes every call in its reply run one after another. */
  readonly sequential?: boolean | undefined;
}

/** A tool as `Tools` holds it: its input as JSON Schema, its params unchecked. */
export interface Tool extends ToolMarks {
  readonly input: Schema.JsonObject;
  readonly run: (
    params: Schema.Json,
    context: ToolContext,
  ) => Effect.Effect<ToolOutput, ToolFailed>;
}

/** The tools by name; of two with one name, the one added last is used. */
export class Tools extends Registry.Service<Tools, Tool>()("tools/Tools") {}

/** One tool call the model asked for. */
export interface ToolCallRequest {
  readonly session: SessionId;
  readonly call: ToolCallPart;
  readonly attributes: Attributes;
}

/** Every tool call; a failure, unknown tool or crash comes back as a failed result. */
export class ToolCall extends Pipeline.Service<ToolCall, ToolCallRequest, ToolResult>()(
  "tools/ToolCall",
) {}

/**
 * A tool whose params `input` checks before `run` sees them; its JSON Schema is what the model
 * sees.
 */
export const defineTool = <S extends Schema.Top & { readonly DecodingServices: never }>(
  tool: ToolMarks & {
    readonly input: S;
    readonly run: (input: S["Type"], context: ToolContext) => Effect.Effect<ToolOutput, ToolFailed>;
  },
): Tool => {
  const decode = Schema.decodeUnknownEffect(Schema.toCodecJson(tool.input));

  return {
    ...tool,
    input: Schema.decodeUnknownSync(Schema.JsonObject)(AiTool.getJsonSchemaFromSchema(tool.input)),
    run: (params, context) =>
      decode(params).pipe(
        Effect.mapError((error) => new ToolFailed({ message: `Invalid input: ${error.message}` })),
        Effect.flatMap((input) => tool.run(input, context)),
      ),
  };
};
