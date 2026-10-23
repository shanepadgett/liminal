/**
 * A session's events as the chat screen shows them: turns of inputs, replies, tool rows and
 * notices. One closed function builds them from `session/*` and `loop/*` events; other plugins'
 * kinds pass through as `event` items for their own renderers. Framework-free, so any frontend can
 * use it.
 */
import { Option, Schema } from "effect";

import type { SessionView } from "@shanepadgett/liminal-client";
import {
  addedOf,
  Interrupted,
  ReplyDelta,
  StepEnded,
  StepStarted,
  ToolDone,
  TurnEnded,
  TurnStarted,
} from "@shanepadgett/liminal-loop/contract";
import type { Message, ToolResult } from "@shanepadgett/liminal-model/contract";
import {
  type Delta,
  type EventKind,
  MessageEvent,
  type NewEvent,
  Notice,
  type SessionEvent,
} from "@shanepadgett/liminal-session/contract";

export type ToolStatus = "running" | "done" | "failed";

export type NoticeLevel = "info" | "warning" | "error";

export type Item =
  /** An input sent after the one that started the turn, such as a steer. */
  | { readonly kind: "input"; readonly id: string; readonly text: string }
  | { readonly kind: "reply"; readonly id: string; readonly text: string; readonly isLive: boolean }
  | {
      readonly kind: "tool";
      readonly id: string;
      readonly name: string;
      readonly params: Schema.Json;
      readonly status: ToolStatus;
      readonly isLive: boolean;
    }
  | {
      readonly kind: "notice";
      readonly id: string;
      readonly level: NoticeLevel;
      readonly text: string;
    }
  /** The user stopped the turn. */
  | { readonly kind: "stopped"; readonly id: string }
  /** Another plugin's event, drawn by the renderer it adds for its kind. */
  | { readonly kind: "event"; readonly id: string; readonly event: SessionEvent };

export interface Turn {
  readonly id: string;
  /** The input that started the turn; missing when it lies before the events loaded. */
  readonly input: string | undefined;
  readonly items: ReadonlyArray<Item>;
}

/** `item`'s data when it is of `kind` and its schema accepts it. */
const decoded = <T>(kind: EventKind<T>, item: Delta): Option.Option<T> =>
  item.kind === kind.kind ? Schema.decodeOption(kind.schema)(item.data) : Option.none();

interface Building {
  readonly id: string;
  input: string | undefined;
  /** By id; setting an id seen before replaces the item in place. */
  readonly items: Map<string, Item>;
}

/** The text the user wrote: the parts before those its `@` tags added. */
const textOf = (message: Message, attached: number) =>
  message.parts
    .slice(0, message.parts.length - attached)
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");

/** What the user wrote in `input`, such as a queued message; none for other inputs or no text. */
export const draftTextOf = (input: NewEvent): Option.Option<string> =>
  decoded(MessageEvent, input).pipe(
    Option.filter((message) => message.role === "user"),
    Option.map((message) => textOf(message, addedOf(input.attributes)).trim()),
    Option.filter((text) => text !== ""),
  );

const makeBuilder = () => {
  const turns: Building[] = [];

  const start = (id: string) => {
    const turn: Building = { id, input: undefined, items: new Map() };
    turns.push(turn);

    return turn;
  };

  const current = () => turns.at(-1) ?? start("start");

  const put = (item: Item) => {
    current().items.set(item.id, item);
  };

  const items = () => current().items;

  const built = (): ReadonlyArray<Turn> =>
    turns.map(({ id, input, items: each }) => ({ id, input, items: [...each.values()] }));

  return { start, current, put, items, built };
};

type Builder = ReturnType<typeof makeBuilder>;

const addInput = (builder: Builder, event: SessionEvent, message: Message) => {
  const turn = builder.current();
  const text = textOf(message, addedOf(event.attributes));

  if (turn.input === undefined && turn.items.size === 0) turn.input = text;
  else builder.put({ kind: "input", id: String(event.seq), text });
};

/** Each text part a reply, each tool call a running row. */
const addReply = (builder: Builder, event: SessionEvent, message: Message) => {
  for (const [index, part] of message.parts.entries()) {
    if (part.type === "text" && part.text.trim() !== "") {
      builder.put({ kind: "reply", id: `${event.seq}:${index}`, text: part.text, isLive: false });
    }

    if (part.type === "tool-call") {
      const { id, name, params } = part;
      builder.put({ kind: "tool", id, name, params, status: "running", isLive: false });
    }
  }
};

/** The row of `result`'s call, done or failed; made from the result when the call lies earlier. */
const addResult = (builder: Builder, result: ToolResult) => {
  const status = result.isFailure ? "failed" : "done";
  const row = builder.items().get(result.callId);
  const base = row?.kind === "tool" ? row : { params: null, isLive: false };
  const { callId: id, name } = result;

  builder.put({ ...base, kind: "tool", id, name, status });
};

const addMessage = (builder: Builder, event: SessionEvent, message: Message) => {
  if (message.role === "user") {
    addInput(builder, event, message);

    return;
  }

  if (message.role === "assistant") {
    addReply(builder, event, message);

    return;
  }

  for (const part of message.parts) if (part.type === "tool-result") addResult(builder, part);
};

/** A turn that ended leaves no row running: a call without a result stopped with it. */
const endTurn = (builder: Builder, event: SessionEvent, outcome: string) => {
  for (const item of builder.items().values()) {
    if (item.kind === "tool" && item.status === "running")
      builder.put({ ...item, status: "failed" });
  }

  if (outcome === "cancelled") {
    builder.put({ kind: "stopped", id: String(event.seq) });
  }
};

const addEvent = (builder: Builder, event: SessionEvent, drawn: ReadonlySet<string>) => {
  if (Option.isSome(decoded(TurnStarted, event))) {
    builder.start(String(event.seq));

    return;
  }

  const message = decoded(MessageEvent, event).pipe(
    Option.orElse(() => Option.map(decoded(Interrupted, event), (data) => data.message)),
  );

  if (Option.isSome(message)) {
    addMessage(builder, event, message.value);

    return;
  }

  const notice = decoded(Notice, event);

  if (Option.isSome(notice)) {
    builder.put({ kind: "notice", id: String(event.seq), ...notice.value });

    return;
  }

  const ended = decoded(TurnEnded, event);

  if (Option.isSome(ended)) {
    endTurn(builder, event, ended.value.outcome);

    return;
  }

  if (drawn.has(event.kind)) builder.put({ kind: "event", id: String(event.seq), event });
};

/** A retry voids the reply so far: its live items go, and a notice says why. */
const retry = (builder: Builder, data: { readonly message: string; readonly attempt: number }) => {
  for (const item of builder.items().values()) {
    if ("isLive" in item && item.isLive) builder.items().delete(item.id);
  }

  const text = `${data.message} Trying again, attempt ${data.attempt}.`;
  builder.put({ kind: "notice", id: "retry", level: "warning", text });
};

const addReplyDelta = (builder: Builder, data: typeof ReplyDelta.schema.Type) => {
  if (data.type === "retry") {
    retry(builder, data);

    return;
  }

  if (data.type === "tool-call" || data.type === "tool-input") {
    const { id, name, params } = data;
    builder.put({ kind: "tool", id, name, params, status: "running", isLive: true });

    return;
  }

  if (data.type === "reasoning") return;

  const id = `live:${data.key}`;
  const live = builder.items().get(id);
  const before = live?.kind === "reply" ? live.text : "";

  builder.put({ kind: "reply", id, text: before + data.text, isLive: true });
};

const addDelta = (builder: Builder, delta: Delta) => {
  const reply = decoded(ReplyDelta, delta);

  if (Option.isSome(reply)) {
    addReplyDelta(builder, reply.value);

    return;
  }

  const done = decoded(ToolDone, delta);
  if (Option.isSome(done)) addResult(builder, done.value);
};

/**
 * The turns of `state`, saved events first, then the deltas streaming now. `drawn` names the kinds
 * other plugins draw; any other kind, such as `loop/step-start`, never shows.
 */
export const buildTranscript = (
  state: SessionView.ViewState,
  drawn: ReadonlySet<string>,
): ReadonlyArray<Turn> => {
  const builder = makeBuilder();

  for (const event of state.events) addEvent(builder, event, drawn);
  for (const delta of state.streaming) addDelta(builder, delta);

  return builder.built();
};

/** The input tokens of the latest finished model call: how much of the context the session uses. */
export const contextUsed = (state: SessionView.ViewState): number | undefined => {
  for (const event of state.events.toReversed()) {
    const ended = decoded(StepEnded, event);

    if (Option.isSome(ended) && ended.value.outcome === "finished") {
      return ended.value.usage.inputTokens.total;
    }
  }

  return undefined;
};

/** The model of the latest model call, which spent the tokens `contextUsed` counts. */
export const stepModel = (state: SessionView.ViewState): string | undefined => {
  for (const event of state.events.toReversed()) {
    const started = decoded(StepStarted, event);
    if (Option.isSome(started)) return started.value.model;
  }

  return undefined;
};

/** Whether reply text or a tool call's input is streaming now, rather than the model thinking. */
export const isWriting = (state: SessionView.ViewState): boolean => {
  const last = state.streaming.at(-1);
  if (last === undefined) return false;

  return Option.exists(
    decoded(ReplyDelta, last),
    (data) => data.type === "text" || data.type === "tool-input",
  );
};
