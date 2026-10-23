/** The tools the model can call and the one path every tool call takes. */
import { Effect, Option, Schema } from "effect";
import { Tool as AiTool } from "effect/ai";

import { type Attributes, Pipeline, Registry } from "@shanepadgett/liminal-core";
import type {
  Image,
  ModelId,
  Text,
  ToolCall as ToolCallPart,
  ToolResult,
} from "@shanepadgett/liminal-model/contract";
import { defineEvent, type SessionId } from "@shanepadgett/liminal-session/contract";

/** What a tool knows about the call it runs. */
export interface ToolContext {
  readonly session: SessionId;
  readonly callId: string;
  /** The attributes of the latest input the turn consumed, such as who sent it. */
  readonly attributes: Attributes;
  /** The model the step that asked for this call runs, as `provider/model`. */
  readonly model: ModelId;
  /**
   * Shows the call's progress while it runs. Not saved; a frontend draws only the latest, so `data`
   * holds the whole progress so far, not what changed.
   */
  readonly progress: (data: Schema.Json) => Effect.Effect<void>;
}

/** A running call's latest progress, published as a delta. Each tool decodes its own `data`. */
export const ToolProgress = defineEvent(
  "tools/progress",
  Schema.Struct({ callId: Schema.String, data: Schema.Json }),
);

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

/**
 * What one call touches: files it reads, files it changes, or anything else, such as running a
 * command. Paths are as the call gives them, relative to the workspace or absolute.
 */
export type Access =
  | { readonly kind: "read"; readonly paths: ReadonlyArray<string> }
  | { readonly kind: "write"; readonly paths: ReadonlyArray<string> }
  | { readonly kind: "run" };

/** A call that touches anything: what a tool without `access` counts as. */
export const runAccess: Access = { kind: "run" };

/** A call that touches no files and runs nothing, such as asking the user. */
export const noAccess: Access = { kind: "read", paths: [] };

/** A tool as `Tools` holds it: its input as JSON Schema, its params unchecked. */
export interface Tool extends ToolMarks {
  readonly input: Schema.JsonObject;
  /** What a call with these params touches; without it every call counts as `run`. */
  readonly access?: ((params: Schema.Json) => Access) | undefined;
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
  /** The model the step that asked for this call runs. */
  readonly model: ModelId;
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
    /** What a call touches; params that fail to decode count as `run`. */
    readonly access?: ((input: S["Type"]) => Access) | undefined;
    readonly run: (input: S["Type"], context: ToolContext) => Effect.Effect<ToolOutput, ToolFailed>;
  },
): Tool => {
  const codec = Schema.toCodecJson(tool.input);
  const decode = Schema.decodeUnknownEffect(codec);
  const decodeOption = Schema.decodeUnknownOption(codec);
  const { access } = tool;

  return {
    ...tool,
    access:
      access === undefined
        ? undefined
        : (params) =>
            Option.match(decodeOption(params), { onNone: () => runAccess, onSome: access }),
    input: Schema.decodeUnknownSync(Schema.JsonObject)(AiTool.getJsonSchemaFromSchema(tool.input)),
    run: (params, context) =>
      decode(params).pipe(
        Effect.mapError((error) => new ToolFailed({ message: `Invalid input: ${error.message}` })),
        Effect.flatMap((input) => tool.run(input, context)),
      ),
  };
};
