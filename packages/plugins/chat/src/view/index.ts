/**
 * A session's events as the chat screen shows them: turns of inputs, replies, tool rows, notices
 * and each turn's last line. One closed function builds them from `session/*` and `loop/*` events;
 * other plugins' kinds pass through as `event` items for their own renderers. Framework-free, so
 * any frontend can use it.
 */
import { DateTime, type Duration, Option, Schema } from "effect";

import type { SessionView } from "@shanepadgett/liminal-client";
import {
  addedOf,
  Interrupted,
  ReplyDelta,
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

/** How a turn ended, as its last line reads; a failed turn ends in its error notice instead. */
export type Ending = "done" | "stopped" | "interrupted";

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
  /**
   * The turn's last line: how it ended, the model of its latest step, and how long it ran. Either
   * is missing when it is unknown; an interrupted turn has no time, as a crash ended it.
   */
  | {
      readonly kind: "end";
      readonly id: string;
      readonly ending: Ending;
      readonly model: string | undefined;
      readonly ran: Duration.Duration | undefined;
    }
  /** Another plugin's event, drawn by the renderer it adds for its kind. */
  | { readonly kind: "event"; readonly id: string; readonly event: SessionEvent };

export type ToolItem = Extract<Item, { readonly kind: "tool" }>;

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
  /** When its `loop/turn-start` was saved; missing when that lies before the events loaded. */
  readonly startedAt: DateTime.Utc | undefined;
  /** Its latest step: the seq of that step's `loop/step-start`, and the model it runs. */
  step: string | undefined;
  model: string | undefined;
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

  const start = (id: string, startedAt?: DateTime.Utc) => {
    const turn: Building = {
      id,
      startedAt,
      step: undefined,
      model: undefined,
      input: undefined,
      items: new Map(),
    };

    turns.push(turn);

    return turn;
  };

  const current = () => turns.at(-1) ?? start("start");

  const put = (item: Item) => {
    current().items.set(item.id, item);
  };

  const items = () => current().items;

  /** The current turn's latest step is `step`, and it runs `model`. */
  const stepWith = (step: string, model: string) => {
    const turn = current();
    turn.step = step;
    turn.model = model;
  };

  /**
   * The id of the latest step's text part at `index`, among its text parts: the same while it
   * streams and once saved, so a frontend keeps drawing one reply.
   */
  const textId = (index: number) => `${current().step ?? current().id}:text:${index}`;

  // The keys of the text parts streaming now, in the order they began.
  const liveTexts: string[] = [];

  /** The id of the streaming text part `key`. */
  const liveTextId = (key: string) => {
    if (!liveTexts.includes(key)) liveTexts.push(key);

    return textId(liveTexts.indexOf(key));
  };

  /** Forgets the text parts streamed so far, as a retry voids them. */
  const forgetLiveTexts = () => {
    liveTexts.length = 0;
  };

  const built = (): ReadonlyArray<Turn> =>
    turns.map(({ id, input, items: each }) => ({ id, input, items: [...each.values()] }));

  return { start, current, put, items, stepWith, textId, liveTextId, forgetLiveTexts, built };
};

type Builder = ReturnType<typeof makeBuilder>;

const addInput = (builder: Builder, event: SessionEvent, message: Message) => {
  const turn = builder.current();
  const text = textOf(message, addedOf(event.attributes));

  if (turn.input === undefined && turn.items.size === 0) turn.input = text;
  else builder.put({ kind: "input", id: String(event.seq), text });
};

/** Each text part a reply, each tool call a running row. */
const addReply = (builder: Builder, message: Message) => {
  let texts = 0;

  for (const part of message.parts) {
    if (part.type === "text") {
      const id = builder.textId(texts);
      texts += 1;

      if (part.text.trim() !== "")
        builder.put({ kind: "reply", id, text: part.text, isLive: false });
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
    addReply(builder, message);

    return;
  }

  for (const part of message.parts) if (part.type === "tool-result") addResult(builder, part);
};

type Outcome = (typeof TurnEnded.schema.Type)["outcome"];

const ENDINGS: Readonly<Record<Outcome, Ending | undefined>> = {
  answered: "done",
  cancelled: "stopped",
  interrupted: "interrupted",
  failed: undefined,
};

/**
 * A turn that ended leaves no row running: a call without a result stopped with it. Then its last
 * line, unless it failed.
 */
const endTurn = (builder: Builder, event: SessionEvent, outcome: Outcome) => {
  for (const item of builder.items().values()) {
    if (item.kind === "tool" && item.status === "running")
      builder.put({ ...item, status: "failed" });
  }

  const ending = ENDINGS[outcome];

  if (ending === undefined) return;

  const { startedAt, model } = builder.current();

  const ran =
    ending === "interrupted" || startedAt === undefined
      ? undefined
      : DateTime.distance(startedAt, event.at);

  builder.put({ kind: "end", id: String(event.seq), ending, model, ran });
};

/** The `loop/*` events that open a turn, name its model and close it; whether `event` is one. */
const addTurnEvent = (builder: Builder, event: SessionEvent): boolean => {
  if (Option.isSome(decoded(TurnStarted, event))) {
    builder.start(String(event.seq), event.at);

    return true;
  }

  const step = decoded(StepStarted, event);

  if (Option.isSome(step)) {
    builder.stepWith(String(event.seq), step.value.model);

    return true;
  }

  const ended = decoded(TurnEnded, event);

  if (Option.isNone(ended)) return false;

  endTurn(builder, event, ended.value.outcome);

  return true;
};

const addEvent = (builder: Builder, event: SessionEvent, drawn: ReadonlySet<string>) => {
  if (addTurnEvent(builder, event)) return;

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

  if (drawn.has(event.kind)) builder.put({ kind: "event", id: String(event.seq), event });
};

/** A retry voids the reply so far: its live items go, and a notice says why. */
const retry = (builder: Builder, data: { readonly message: string; readonly attempt: number }) => {
  for (const item of builder.items().values()) {
    if ("isLive" in item && item.isLive) builder.items().delete(item.id);
  }

  builder.forgetLiveTexts();

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

  const id = builder.liveTextId(data.key);
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

/** Whether reply text or a tool call's input is streaming now, rather than the model thinking. */
export const isWriting = (state: SessionView.ViewState): boolean => {
  const last = state.streaming.at(-1);
  if (last === undefined) return false;

  return Option.exists(
    decoded(ReplyDelta, last),
    (data) => data.type === "text" || data.type === "tool-input",
  );
};
