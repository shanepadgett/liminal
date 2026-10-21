/** A scripted model provider for tests: each call plays a script and every request is kept. */

import { Context, type Effect, type Latch } from "effect";

import type {
  FinishReason,
  ModelError,
  ModelEvent,
  ModelPart,
  ModelRequest,
  Usage,
} from "@liminal/sdk";

/** One step of a script, played in order. */
export type ScriptStep =
  | { readonly type: "event"; readonly event: ModelEvent }
  /** Ends the call with `error`. */
  | { readonly type: "fail"; readonly error: ModelError }
  /** Waits until the call is interrupted. */
  | { readonly type: "hang" }
  /** Waits until the test opens `gate`. */
  | { readonly type: "gate"; readonly gate: Latch.Latch };

export type Script = ReadonlyArray<ScriptStep>;

/** The provider id the scripted provider registers. */
export const scriptedProvider = "scripted";

export class ScriptedModel extends Context.Service<
  ScriptedModel,
  {
    /** Each script answers one call, in order, before any repeated script. */
    readonly enqueue: (...scripts: ReadonlyArray<Script>) => Effect.Effect<void>;
    /** Answers every call once the queue is empty; a call with neither is a defect. */
    readonly repeat: (script: Script) => Effect.Effect<void>;
    /** Every request received, oldest first. */
    readonly requests: Effect.Effect<ReadonlyArray<ModelRequest>>;
  }
>()("liminal/model-scripted/ScriptedModel") {}

const noUsage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };

const event = (modelEvent: ModelEvent): ScriptStep => ({ type: "event", event: modelEvent });

/** The events of one finished part at `index`, its text streamed as one delta. */
const partEvents = (index: number, part: ModelPart): Script => {
  if (part.type === "text" || part.type === "reasoning") {
    return [
      event({ type: "part-start", index, part: { type: part.type } }),
      event({ type: "delta", index, text: part.text }),
      event({ type: "part-end", index, part }),
    ];
  }

  if (part.type === "tool-call") {
    return [
      event({
        type: "part-start",
        index,
        part: { type: "tool-call", id: part.id, name: part.name },
      }),
      event({ type: "delta", index, text: JSON.stringify(part.params) }),
      event({ type: "part-end", index, part }),
    ];
  }

  return [event({ type: "part-end", index, part })];
};

/** A whole reply: start, each part, then finish. */
export const reply = (
  parts: ReadonlyArray<ModelPart>,
  finish: { readonly reason?: FinishReason; readonly usage?: Usage } = {},
): Script => [
  event({ type: "start" }),
  ...parts.flatMap((part, index) => partEvents(index, part)),
  event({ type: "finish", reason: finish.reason ?? "stop", usage: finish.usage ?? noUsage }),
];

/** A reply of one text part. */
export const replyText = (text: string): Script =>
  reply([{ type: "text", text, providerData: {} }]);
