/** `effect/ai` response parts as Liminal model events, numbering each reply part from 0. */

import { Effect, Predicate, Schema, Stream } from "effect";
import type { Response, Tool } from "effect/ai";

import {
  type FinishReason,
  ModelError,
  type ModelErrorReason,
  type ModelEvent,
  type ModelPart,
  type PartKind,
} from "../core/index.ts";
import { keptData, type ProviderData } from "./data.ts";

type Kept = ReturnType<typeof keptData>;

/** The response parts that become events as they are. */
type Forwarded =
  | Response.TextStartPart
  | Response.TextDeltaPart
  | Response.TextEndPart
  | Response.ReasoningStartPart
  | Response.ReasoningDeltaPart
  | Response.ReasoningEndPart
  | Response.ToolParamsStartPart
  | Response.ToolParamsDeltaPart
  | Response.FinishPart;

const forwarded = new Set<string>([
  "text-start",
  "text-delta",
  "text-end",
  "reasoning-start",
  "reasoning-delta",
  "reasoning-end",
  "tool-params-start",
  "tool-params-delta",
  "finish",
]);

const isForwarded = <P extends { readonly type: string }>(part: P): part is Extract<P, Forwarded> =>
  forwarded.has(part.type);

/**
 * A response part once checked: tool-call params are JSON; parts Liminal does not model are
 * ignored.
 */
type Part =
  | Forwarded
  | {
      readonly type: "tool-call";
      readonly id: string;
      readonly name: string;
      readonly params: Schema.Json;
      readonly metadata: Response.ProviderMetadata;
    }
  | { readonly type: "ignored" };

interface OpenPart {
  readonly index: number;
  readonly text: string;
}

/** The parts streaming now, by response part id, and the next free index. */
interface Progress {
  readonly next: number;
  readonly open: ReadonlyMap<string, OpenPart>;
}

const noProgress: Progress = { next: 0, open: new Map() };

type Step = readonly [Progress, ReadonlyArray<ModelEvent>];

const begin = (progress: Progress, id: string, part: PartKind): Step => {
  const index = progress.next;
  const open = new Map(progress.open).set(id, { index, text: "" });

  return [{ next: index + 1, open }, [{ type: "part-start", index, part }]];
};

const grow = (progress: Progress, id: string, text: string): Step => {
  const part = progress.open.get(id);
  if (part === undefined) return [progress, []];

  const open = new Map(progress.open).set(id, { ...part, text: part.text + text });

  return [{ ...progress, open }, [{ type: "delta", index: part.index, text }]];
};

/** Closes part `id` as the part `finished` builds from its streamed text. */
const close = (progress: Progress, id: string, finished: (text: string) => ModelPart): Step => {
  const part = progress.open.get(id);
  if (part === undefined) return [progress, []];

  const open = new Map(progress.open);
  open.delete(id);

  return [
    { ...progress, open },
    [{ type: "part-end", index: part.index, part: finished(part.text) }],
  ];
};

const textual = (progress: Progress, part: Part, kept: Kept): Step | undefined => {
  if (part.type === "text-start") return begin(progress, part.id, { type: "text" });
  if (part.type === "reasoning-start") return begin(progress, part.id, { type: "reasoning" });

  if (part.type === "text-delta" || part.type === "reasoning-delta") {
    return grow(progress, part.id, part.delta);
  }

  if (part.type === "text-end" || part.type === "reasoning-end") {
    const type = part.type === "text-end" ? "text" : "reasoning";
    const providerData = kept(part.metadata);

    return close(progress, part.id, (text) => ({ type, text, providerData }));
  }

  return undefined;
};

const toolCall = (progress: Progress, part: Part, kept: Kept): Step | undefined => {
  if (part.type === "tool-params-start") {
    return begin(progress, part.id, { type: "tool-call", id: part.id, name: part.name });
  }

  if (part.type === "tool-params-delta") return grow(progress, part.id, part.delta);
  if (part.type !== "tool-call") return undefined;

  const [started, starts] = progress.open.has(part.id)
    ? [progress, []]
    : begin(progress, part.id, { type: "tool-call", id: part.id, name: part.name });

  const { id, name, params } = part;
  const providerData = kept(part.metadata);

  const [ended, ends] = close(started, id, () => ({
    type: "tool-call",
    id,
    name,
    params,
    providerData,
  }));

  return [ended, [...starts, ...ends]];
};

const finishReason = (reason: Response.FinishReason): FinishReason =>
  reason === "stop" || reason === "length" || reason === "tool-calls" || reason === "content-filter"
    ? reason
    : "other";

const finish = (part: Part): ReadonlyArray<ModelEvent> | undefined => {
  if (part.type !== "finish") return undefined;

  const { inputTokens, outputTokens } = part.usage;

  return [
    {
      type: "finish",
      reason: finishReason(part.reason),
      usage: {
        input: inputTokens.uncached ?? 0,
        output: outputTokens.total ?? 0,
        cacheRead: inputTokens.cacheRead ?? 0,
        cacheWrite: inputTokens.cacheWrite ?? 0,
        reasoning: outputTokens.reasoning ?? 0,
      },
    },
  ];
};

/** The events one response part adds; parts Liminal does not model add none. */
const translate =
  (kept: Kept) =>
  (progress: Progress, part: Part): Step =>
    textual(progress, part, kept)
    ?? toolCall(progress, part, kept) ?? [progress, finish(part) ?? []];

/** What an error the backend streams says, and the reason it stands for. */
const streamedError = (name: string, { error }: Response.ErrorPart): ModelError => {
  const message =
    Predicate.hasProperty(error, "message") && Predicate.isString(error.message)
      ? error.message
      : `${name} failed the response`;

  const code =
    Predicate.hasProperty(error, "code") && Predicate.isString(error.code) ? error.code : "";

  return new ModelError({ reason: reasonOfCode(code), message });
};

const reasonOfCode = (code: string): ModelErrorReason => {
  if (code.includes("context_length")) return "context-overflow";
  if (code.includes("rate_limit")) return "rate-limit";
  if (code.includes("quota") || code.includes("usage_limit")) return "quota";

  return "provider";
};

const isJson = Schema.is(Schema.Json);

/** Fails on an error part, and checks that tool-call params are JSON. */
const check =
  (name: string) =>
  <Tools extends Record<string, Tool.Any>>(
    part: Response.StreamPart<Tools, "deferred">,
  ): Effect.Effect<Part, ModelError> => {
    if (isForwarded(part)) return Effect.succeed(part);
    if (part.type === "error") return Effect.fail(streamedError(name, part));
    if (part.type !== "tool-call") return Effect.succeed({ type: "ignored" });

    const { id, params, metadata } = part;

    if (isJson(params))
      return Effect.succeed({ type: "tool-call", id, name: part.name, params, metadata });

    return Effect.fail(
      new ModelError({
        reason: "provider",
        message: `${name} sent unreadable params for ${part.name}`,
      }),
    );
  };

const start: ModelEvent = { type: "start" };

/**
 * A reply's response parts as model events, starting with `start`. `name` names the provider in
 * errors; `data` is the metadata its parts keep for the next request.
 */
export const streamOf = <Tools extends Record<string, Tool.Any>, R>(
  name: string,
  data: ProviderData,
  parts: Stream.Stream<Response.StreamPart<Tools, "deferred">, ModelError, R>,
): Stream.Stream<ModelEvent, ModelError, R> =>
  parts.pipe(
    Stream.mapEffect(check(name)),
    Stream.mapAccum(() => noProgress, translate(keptData(data))),
    Stream.prepend([start]),
  );
