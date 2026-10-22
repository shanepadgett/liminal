/** What the model is told about each tool, logged once and changed only by notes. */
import { Context, type Effect, Schema } from "effect";

import { Pipeline } from "@shanepadgett/liminal-core";
import { ToolDefinition } from "@shanepadgett/liminal-model/contract";
import {
  defineEvent,
  type EventInvalid,
  type SessionEvent,
  type SessionId,
  type SessionNotFound,
  type SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";
import type { Tool } from "@shanepadgett/liminal-tools/contract";

/** A tool as the model sees it; wrap to change a description without replacing the tool. */
export class ToolDefinitions extends Pipeline.Service<ToolDefinitions, Tool, ToolDefinition>()(
  "tool-definitions/ToolDefinitions",
) {}

/** The whole tool list, logged at session start and at a fold. */
export const ToolListRecord = defineEvent(
  "tool-definitions/list",
  Schema.Struct({ tools: Schema.Array(ToolDefinition) }),
);

/** Tools added or changed since the list was logged, and tools removed by name. */
export const ToolListChange = defineEvent(
  "tool-definitions/change",
  Schema.Struct({ added: Schema.Array(ToolDefinition), removed: Schema.Array(Schema.String) }),
);

type LogError = SessionNotFound | SessionStoreFailed | EventInvalid;

export class ToolList extends Context.Service<
  ToolList,
  {
    /** Logs the list if the session has none, else a change for what differs. */
    readonly sync: (session: SessionId) => Effect.Effect<void, LogError>;
    /** The tools the log says the model is sent; a removed tool stays until the next fold. */
    readonly current: (
      events: ReadonlyArray<SessionEvent>,
    ) => Effect.Effect<ReadonlyArray<ToolDefinition>, EventInvalid>;
    /** Logs the list again from the current tools. */
    readonly fold: (session: SessionId) => Effect.Effect<void, LogError>;
  }
>()("tool-definitions/ToolList") {}
