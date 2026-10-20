/** Tools the model can call: what each declares and how a call runs. */

import { Effect, Schema, SchemaAST } from "effect";

import type { ToolSpec } from "./model.ts";
import type { SessionId } from "./session.ts";

/** Labels with the meaning of MCP tool annotations; permission and approval rules read them. */
export const ToolHints = Schema.Struct({
  readOnlyHint: Schema.Boolean,
  destructiveHint: Schema.Boolean,
  idempotentHint: Schema.Boolean,
  openWorldHint: Schema.Boolean,
});

export type ToolHints = typeof ToolHints.Type;

/** MCP's defaults for missing hints: not read-only, may be destructive, reaches an open world. */
export const defaultHints: ToolHints = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

export interface ToolCallContext {
  readonly sessionId: SessionId;
  readonly callId: string;
}

/** A finished call: what the model sees and details for display; both are saved. */
export interface ToolOutput {
  readonly result: Schema.Json;
  readonly details?: Schema.Json | undefined;
  /** Deferred tools this call loads, by name, such as the tools a search found. */
  readonly loads?: ReadonlyArray<string> | undefined;
}

/**
 * How a tool reaches the model: offered from the session's first request, deferred until the model
 * loads it through tool search, or declared and offered only by its own plugin.
 */
export type ToolOffer = "start" | "search" | "plugin";

/** A call that failed: wrong params or the tool's own failure; the model sees `message`. */
export class ToolFailed extends Schema.TaggedError<ToolFailed, { readonly brand: unique symbol }>()(
  "ToolFailed",
  { message: Schema.String, details: Schema.optional(Schema.Json) },
) {}

export interface Tool {
  readonly spec: ToolSpec;
  readonly offer: ToolOffer;
  /** Rule lines for the system prompt, such as when to prefer this tool over another. */
  readonly guidance: ReadonlyArray<string>;
  readonly hints: ToolHints;
  /** Can run at the same time as other calls in one step. */
  readonly runAlongside: boolean;
  /** Can run again after a restart cut it short. */
  readonly safeToRerun: boolean;
  /** Runs one call with params the model sent, unchecked. */
  readonly run: (
    params: Schema.Json,
    context: ToolCallContext,
  ) => Effect.Effect<ToolOutput, ToolFailed>;
}

export interface ToolDefinition<S extends Schema.Top> {
  readonly name: string;
  readonly description: string;
  /** Checks the params; its JSON Schema is what the model sees. */
  readonly parameters: S;
  /** Missing offer is `start`. */
  readonly offer?: ToolOffer;
  /** Missing guidance is none. */
  readonly guidance?: ReadonlyArray<string>;
  /** Missing hints take the MCP defaults. */
  readonly hints?: Partial<ToolHints>;
  readonly runAlongside: boolean;
  readonly safeToRerun: boolean;
  readonly run: (
    params: S["Type"],
    context: ToolCallContext,
  ) => Effect.Effect<ToolOutput, ToolFailed>;
}

/** A struct with no fields, such as the params of a tool that takes none. */
const isEmptyStruct = (ast: SchemaAST.AST) =>
  SchemaAST.isObjects(ast)
  && ast.propertySignatures.length === 0
  && ast.indexSignatures.length === 0;

/**
 * The JSON Schema of `schema`, with its definitions inline under `$defs`. A struct with no fields
 * is an object with no properties, since providers take only object schemas for tool params; Effect
 * writes it as any value but null.
 */
export const jsonSchemaOf = (schema: Schema.Top): Schema.Json => {
  if (isEmptyStruct(schema.ast)) return { type: "object", properties: {} };

  const document = Schema.toJsonSchemaDocument(schema);
  const definitions = document.definitions;

  const root =
    Object.keys(definitions).length === 0
      ? document.schema
      : { ...document.schema, $defs: definitions };

  return Schema.decodeUnknownSync(Schema.Json)(root);
};

/** A tool whose params are checked by `parameters` before `run` sees them. */
export const defineTool = <S extends Schema.Top & { readonly DecodingServices: never }>(
  definition: ToolDefinition<S>,
): Tool => {
  const decode = Schema.decodeUnknownEffect(Schema.toCodecJson(definition.parameters));

  return {
    spec: {
      name: definition.name,
      description: definition.description,
      parameters: jsonSchemaOf(definition.parameters),
    },
    offer: definition.offer ?? "start",
    guidance: definition.guidance ?? [],
    hints: { ...defaultHints, ...definition.hints },
    runAlongside: definition.runAlongside,
    safeToRerun: definition.safeToRerun,
    run: (params, context) =>
      decode(params).pipe(
        Effect.mapError((error) => new ToolFailed({ message: `invalid params: ${error.message}` })),
        Effect.flatMap((decoded) => definition.run(decoded, context)),
      ),
  };
};
