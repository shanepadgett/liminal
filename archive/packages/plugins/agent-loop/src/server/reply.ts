/** A reply as it streams, and the entries it and its tool results are saved as. */

import { Schema } from "effect";

import {
  draft,
  type Entry,
  type EntryDraft,
  type ModelContent,
  type ModelEvent,
  type ModelPart,
  type PartKind,
} from "@liminal/sdk";
import {
  type Finish,
  ReasoningEntry,
  TextEntry,
  ToolCallEntry,
  ToolResultEntry,
  type ToolResultStatus,
} from "@liminal/session-log/contract";

/** One part of a reply: still streaming, or finished. */
export type PartState =
  | { readonly type: "streaming"; readonly kind: PartKind; readonly text: string }
  | { readonly type: "done"; readonly part: ModelPart };

/** A reply so far, its parts by index. */
export interface ReplyState {
  readonly parts: ReadonlyArray<PartState | undefined>;
  readonly finish?: Finish;
}

export const emptyReply: ReplyState = { parts: [] };

const withPart = (state: ReplyState, index: number, part: PartState): ReplyState => {
  const parts = [...state.parts];
  parts[index] = part;

  return { ...state, parts };
};

/** The reply after `event`. */
export const applyEvent = (state: ReplyState, event: ModelEvent): ReplyState => {
  if (event.type === "part-start") {
    return withPart(state, event.index, { type: "streaming", kind: event.part, text: "" });
  }

  if (event.type === "delta") {
    const part = state.parts[event.index];
    if (part?.type !== "streaming") return state;

    return withPart(state, event.index, { ...part, text: part.text + event.text });
  }

  if (event.type === "part-end") {
    return withPart(state, event.index, { type: "done", part: event.part });
  }

  if (event.type === "finish") {
    return { ...state, finish: { reason: event.reason, usage: event.usage } };
  }

  return state;
};

/**
 * A reply's parts as a JSON live state value. A finished text or thought keeps its text, since it
 * is saved only with the whole reply and must stay on screen until then.
 */
export const liveData = (state: ReplyState): Schema.Json => ({
  parts: state.parts.flatMap((part): Array<Schema.Json> => {
    if (part === undefined) return [];
    if (part.type === "streaming") return [{ ...part.kind, text: part.text }];

    if (part.part.type === "text" || part.part.type === "reasoning") {
      return [{ type: part.part.type, text: part.part.text, done: true }];
    }

    return [{ type: part.part.type, done: true }];
  }),
});

/** A part that can be saved: finished, or text and reasoning cut short. */
interface Saved {
  readonly part: ModelPart;
  readonly interrupted: boolean;
}

/** The parts to save; a tool call whose params never finished is dropped. */
const savedParts = (state: ReplyState): ReadonlyArray<Saved> =>
  state.parts.flatMap((part): Array<Saved> => {
    if (part === undefined) return [];
    if (part.type === "done") return [{ part: part.part, interrupted: false }];
    if (part.kind.type === "tool-call") return [];

    return [
      { part: { type: part.kind.type, text: part.text, providerData: {} }, interrupted: true },
    ];
  });

const assistant = (part: ModelPart): ReadonlyArray<ModelContent> => [
  { role: "assistant", parts: [part] },
];

const partDraft = (saved: Saved, finish: Finish | undefined): ReadonlyArray<EntryDraft> => {
  const { part, interrupted } = saved;
  const end = finish === undefined ? {} : { finish };

  if (part.type === "text") {
    return [
      draft(TextEntry, {
        data: { text: part.text, interrupted, ...end },
        model: assistant(part),
        text: part.text,
      }),
    ];
  }

  if (part.type === "reasoning") {
    return [
      draft(ReasoningEntry, {
        data: { text: part.text, interrupted, ...end },
        // Providers reject reasoning without the signature only a finished part carries.
        model: interrupted ? [] : assistant(part),
        text: part.text,
      }),
    ];
  }

  if (part.type === "tool-call") {
    return [
      draft(ToolCallEntry, {
        data: { id: part.id, name: part.name, params: part.params, ...end },
        model: assistant(part),
        text: `${part.name} ${JSON.stringify(part.params)}`,
      }),
    ];
  }

  return [];
};

/** The reply's entries, the finish on the last one. */
export const replyDrafts = (state: ReplyState): ReadonlyArray<EntryDraft> => {
  const parts = savedParts(state);

  return parts.flatMap((saved, index) =>
    partDraft(saved, index === parts.length - 1 ? state.finish : undefined),
  );
};

/** A tool call the reply asked for. */
export interface CallPart {
  readonly id: string;
  readonly name: string;
  readonly params: Schema.Json;
}

/** The finished tool calls of a reply, in order. */
export const replyCalls = (state: ReplyState): ReadonlyArray<CallPart> =>
  savedParts(state).flatMap(({ part }) =>
    part.type === "tool-call" ? [{ id: part.id, name: part.name, params: part.params }] : [],
  );

/** How a tool call ended: what the model sees and details for display. */
export interface ToolResult {
  readonly status: ToolResultStatus;
  readonly result: Schema.Json;
  readonly details: Schema.Json | undefined;
  /** Deferred tools the result loads; only a done call loads any. */
  readonly loads: ReadonlyArray<string>;
}

/** A tool call's result entry; every status but `done` is a failure. */
export const resultDraft = (call: CallPart, result: ToolResult): EntryDraft => {
  const data = { callId: call.id, name: call.name, status: result.status, result: result.result };

  const part: Extract<ModelPart, { type: "tool-result" }> = {
    type: "tool-result",
    callId: call.id,
    name: call.name,
    result: result.result,
    isFailure: result.status !== "done",
  };

  return draft(ToolResultEntry, {
    data: result.details === undefined ? data : { ...data, details: result.details },
    model: [
      {
        role: "tool",
        parts: [result.loads.length === 0 ? part : { ...part, loads: result.loads }],
      },
    ],
    text: `${call.name}: ${result.status}`,
  });
};

const isCall = Schema.is(Schema.toType(ToolCallEntry.data));
const isResult = Schema.is(Schema.toType(ToolResultEntry.data));

/** Tool calls in `entries` with no result entry, in order. */
export const unanswered = (entries: ReadonlyArray<Entry>): ReadonlyArray<CallPart> => {
  const answered = new Set(
    entries.flatMap((entry) =>
      entry.kind === ToolResultEntry.kind && isResult(entry.data) ? [entry.data.callId] : [],
    ),
  );

  return entries.flatMap((entry) =>
    entry.kind === ToolCallEntry.kind && isCall(entry.data) && !answered.has(entry.data.id)
      ? [{ id: entry.data.id, name: entry.data.name, params: entry.data.params }]
      : [],
  );
};
