/** The turn: inputs into a session, the hooks that join each turn, and the session's next request. */
import { Context, type Effect, Option, Schema, type Stream } from "effect";
import { Response } from "effect/ai";
import { Rpc, RpcGroup } from "effect/rpc";

import { Attribute, type Attributes, Pipeline, Registry } from "@shanepadgett/liminal-core";
import {
  Message,
  type ModelCallError,
  type ModelRequest,
  ModelId,
  ToolCall,
  ToolResult,
} from "@shanepadgett/liminal-model/contract";
import {
  defineEvent,
  EventInvalid,
  NewEvent,
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";

/** Any event that starts or joins a turn, such as a user `session/message`. */
export type Input = NewEvent;

/** A steer joins before the turn's next model call; a follow-up waits until the turn would end. */
export const SendMode = Schema.Literals(["steer", "follow-up"]);
export type SendMode = typeof SendMode.Type;

export interface SendRequest {
  readonly session: SessionId;
  readonly input: Input;
  readonly mode: SendMode;
}

type LogError = SessionNotFound | SessionStoreFailed | EventInvalid;

/** Every input; wrap it to attach attributes or turn inputs away. */
export class Send extends Pipeline.Service<Send, SendRequest, void, LogError>()("loop/Send") {}

export class Inbox extends Context.Service<
  Inbox,
  {
    /**
     * Logs the input and starts a turn when the session is idle; during a turn it waits in memory.
     * `mode` defaults to `steer`.
     */
    readonly send: (
      session: SessionId,
      input: Input,
      mode?: SendMode,
    ) => Effect.Effect<void, LogError>;
    /** Stops the running turn and returns the inputs that were waiting, oldest first. */
    readonly cancel: (session: SessionId) => Effect.Effect<ReadonlyArray<Input>>;
    /** The session's state now, then each change. */
    readonly state: (session: SessionId) => Stream.Stream<LoopState>;
  }
>()("loop/Inbox") {}

/** What `loop` holds in memory for a session; only it knows whether a turn runs. */
export const LoopState = Schema.Struct({
  /** A turn, or a fold of the system prompt and tool list, runs in the session. */
  running: Schema.Boolean,
});

export type LoopState = typeof LoopState.Type;

/** The turn a hook runs in. */
export interface Turn {
  readonly session: SessionId;
  /** The attributes of the latest input the turn took, such as who sent it. */
  readonly attributes: Attributes;
}

export type Hook = (turn: Turn) => Effect.Effect<void, LogError>;

/** Runs before each model call, after the system prompt and tool list sync; logs its own records. */
export class BeforeCall extends Registry.Service<BeforeCall, Hook>()("loop/BeforeCall") {}

/** Runs when the model answers without tool calls; a hook continues the turn by sending a follow-up. */
export class TurnEnd extends Registry.Service<TurnEnd, Hook>()("loop/TurnEnd") {}

export class Turns extends Context.Service<
  Turns,
  {
    /** The session's next model request, as its next model call would send it. */
    readonly request: (
      session: SessionId,
    ) => Effect.Effect<ModelRequest, LogError | ModelCallError>;
    /** Waits for the running turn, then logs the system prompt and tool list again. */
    readonly fold: (session: SessionId) => Effect.Effect<void, LogError>;
  }
>()("loop/Turns") {}

/** A turn began; it is logged before the inputs that start it, and the model never sees it. */
export const TurnStarted = defineEvent("loop/turn-start", Schema.Struct({}));

/** One model call began. */
export const StepStarted = defineEvent("loop/step-start", Schema.Struct({ model: ModelId }));

/**
 * How a model call ended. `finished` carries the provider's reason and token counts; `interrupted`
 * closes a step a crash left open.
 */
export const StepEnded = defineEvent(
  "loop/step-end",
  Schema.Union([
    Schema.Struct({
      outcome: Schema.Literal("finished"),
      reason: Response.FinishReason,
      usage: Schema.toCodecJson(Response.Usage),
    }),
    Schema.Struct({ outcome: Schema.Literals(["failed", "cancelled", "interrupted"]) }),
  ]),
);

/** How a turn ended; `interrupted` closes a turn a crash left unfinished. */
export const TurnEnded = defineEvent(
  "loop/turn-end",
  Schema.Struct({ outcome: Schema.Literals(["answered", "failed", "cancelled", "interrupted"]) }),
);

/** A reply cut short by a cancel; it has no converter, so the model never sees it. */
export const Interrupted = defineEvent("loop/interrupted", Schema.Struct({ message: Message }));

/** The reply as it streams; a retry means the reply so far is void. */
export const ReplyDelta = defineEvent(
  "loop/reply",
  Schema.Union([
    Schema.Struct({
      type: Schema.Literals(["text", "reasoning"]),
      key: Schema.String,
      text: Schema.String,
    }),
    ToolCall,
    /** A tool call's params so far, whole each time; `id` is the call's. */
    Schema.Struct({
      type: Schema.Literal("tool-input"),
      id: Schema.String,
      name: Schema.String,
      params: Schema.Json,
    }),
    Schema.Struct({
      type: Schema.Literal("retry"),
      attempt: Schema.Int,
      attempts: Schema.Int,
      delayMillis: Schema.Finite,
      message: Schema.String,
    }),
  ]),
);

/** One tool call finished; its result is logged once every earlier call's is. */
export const ToolDone = defineEvent("loop/tool-done", ToolResult);

/** What screens call. */
export class LoopRpc extends RpcGroup.make(
  Rpc.make("loop/send", {
    payload: { session: SessionId, input: NewEvent, mode: Schema.optional(SendMode) },
    error: Schema.Union([SessionNotFound, SessionStoreFailed, EventInvalid]),
  }),
  Rpc.make("loop/cancel", { payload: { session: SessionId }, success: Schema.Array(NewEvent) }),
  Rpc.make("loop/state", { payload: { session: SessionId }, success: LoopState, stream: true }),
) {}

/**
 * On a user message: how many of its last parts plugins added on send, such as a tagged file's
 * text, so screens can show only what the user wrote. A `Send` wrap that appends parts adds its
 * count to the one already set.
 */
export const Added = Attribute.make("loop/added", Schema.Int);

/** How many of the message's last parts plugins added; 0 when none. */
export const addedOf = (attributes: Attributes): number => {
  const encoded = attributes[Added.key];
  if (encoded === undefined) return 0;

  return Option.getOrElse(Schema.decodeOption(Added.schema)(encoded), () => 0);
};
