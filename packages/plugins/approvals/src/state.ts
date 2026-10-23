/**
 * What the classifier and the reviewer see of a call: the call, where it runs, the user's latest
 * request and the turn's earlier calls. Never the agent's text or a tool result: the agent cannot
 * argue its case, and injected instructions arrive through results.
 */
import { Option, Schema } from "effect";

import { TurnStarted } from "@shanepadgett/liminal-loop/contract";
import type { Message } from "@shanepadgett/liminal-model/contract";
import { MessageEvent, type SessionEvent } from "@shanepadgett/liminal-session/contract";

import { AllowedFolder } from "./contract.ts";

const REQUEST_CHARS = 800;
const CALL_CHARS = 300;
const EARLIER_CALLS = 10;

export const State = Schema.Struct({
  tool: Schema.String,
  /** The call's params as JSON. */
  input: Schema.String,
  workspace: Schema.String,
  allowedFolders: Schema.Array(AllowedFolder),
  /** The end of the user's latest message. */
  userRequest: Schema.String,
  /** The turn's earlier calls, their params cut short. */
  earlierCalls: Schema.Array(Schema.Struct({ tool: Schema.String, input: Schema.String })),
});

export type State = typeof State.Type;

export interface Call {
  readonly id: string;
  readonly tool: string;
  readonly params: Schema.Json;
}

const decodeMessage = Schema.decodeOption(MessageEvent.schema);

/** The messages in `events`, oldest first. */
export const messagesOf = (events: ReadonlyArray<SessionEvent>): ReadonlyArray<Message> =>
  events.flatMap((event) =>
    event.kind === MessageEvent.kind ? Option.toArray(decodeMessage(event.data)) : [],
  );

/** A user message's words. */
export const textOf = (message: Message) =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

const cut = (text: string, chars: number) =>
  text.length > chars ? `${text.slice(0, chars)}…` : text;

export const stateOf = (
  events: ReadonlyArray<SessionEvent>,
  call: Call,
  where: { readonly workspace: string; readonly folders: ReadonlyArray<AllowedFolder> },
): State => {
  const latest = messagesOf(events).findLast((message) => message.role === "user");
  const start = events.findLastIndex((event) => event.kind === TurnStarted.kind);

  const earlier = messagesOf(events.slice(start + 1))
    .flatMap((message) => (message.role === "assistant" ? message.parts : []))
    .flatMap((part) =>
      part.type === "tool-call" && part.id !== call.id
        ? [{ tool: part.name, input: cut(JSON.stringify(part.params), CALL_CHARS) }]
        : [],
    );

  return {
    tool: call.tool,
    input: JSON.stringify(call.params),
    workspace: where.workspace,
    allowedFolders: where.folders,
    userRequest: latest === undefined ? "" : textOf(latest).slice(-REQUEST_CHARS),
    earlierCalls: earlier.slice(-EARLIER_CALLS),
  };
};
