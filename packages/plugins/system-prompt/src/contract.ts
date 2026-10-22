/** The system prompt: sections from other plugins, logged once and changed only by notes. */
import { Context, type Effect, Schema } from "effect";

import { Registry } from "@shanepadgett/liminal-core";
import {
  defineEvent,
  type EventInvalid,
  type SessionEvent,
  type SessionId,
  type SessionNotFound,
  type SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";

/** One part of the system prompt; empty text leaves it out. */
export interface Section {
  readonly name: string;
  readonly text: Effect.Effect<string>;
}

/** The sections, in prompt order: lowest `order` first. */
export class Sections extends Registry.Service<Sections, Section>()("system-prompt/Sections") {}

/** The whole system prompt, logged at session start and at a fold. */
export const PromptRecord = defineEvent(
  "system-prompt/prompt",
  Schema.Struct({
    sections: Schema.Array(Schema.Struct({ name: Schema.String, text: Schema.String })),
  }),
);

/** The sections that changed since the prompt was logged; `null` text means removed. */
export const PromptChange = defineEvent(
  "system-prompt/change",
  Schema.Struct({
    sections: Schema.Array(
      Schema.Struct({ name: Schema.String, text: Schema.NullOr(Schema.String) }),
    ),
  }),
);

type LogError = SessionNotFound | SessionStoreFailed | EventInvalid;

export class SystemPrompt extends Context.Service<
  SystemPrompt,
  {
    /** Logs the prompt if the session has none, else a change note for what differs. */
    readonly sync: (session: SessionId) => Effect.Effect<void, LogError>;
    /** The text of the latest logged prompt, which is what the model is sent as its system prompt. */
    readonly current: (events: ReadonlyArray<SessionEvent>) => Effect.Effect<string, EventInvalid>;
    /** Logs the prompt again from the current sections. */
    readonly fold: (session: SessionId) => Effect.Effect<void, LogError>;
  }
>()("system-prompt/SystemPrompt") {}
