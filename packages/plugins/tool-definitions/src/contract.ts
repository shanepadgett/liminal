/** What the model is told about each tool, logged once and changed only by tool changes. */
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

/** The tools offered from the start, logged at session start and at a fold; deferred tools are not. */
export const ToolListRecord = defineEvent(
  "tool-definitions/list",
  Schema.Struct({ tools: Schema.Array(ToolDefinition) }),
);

/**
 * Tools added, offered or changed since the list was logged, and tools removed or withdrawn by
 * name; the model reads it as a `tool-change` part.
 */
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
    /** The tools the latest list declared; later changes reach the model as `tool-change` parts. */
    readonly current: (
      events: ReadonlyArray<SessionEvent>,
    ) => Effect.Effect<ReadonlyArray<ToolDefinition>, EventInvalid>;
    /** Logs the list again from the current tools; offered deferred tools are left out. */
    readonly fold: (session: SessionId) => Effect.Effect<void, LogError>;
    /** Logs a change offering the deferred tools `names`; nothing for those offered already. */
    readonly offer: (
      session: SessionId,
      names: ReadonlyArray<string>,
    ) => Effect.Effect<void, LogError>;
    /** Logs a change withdrawing the tools `names`; nothing for those not offered. */
    readonly withdraw: (
      session: SessionId,
      names: ReadonlyArray<string>,
    ) => Effect.Effect<void, LogError>;
  }
>()("tool-definitions/ToolList") {}
