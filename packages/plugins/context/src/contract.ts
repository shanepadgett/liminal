/**
 * What the model sees: prompt sections, view steps, the context entry kinds and the Context
 * service.
 */

import { Context as EffectContext, Effect, Equal, Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  defineEntry,
  draft,
  type Entry,
  type EntryDraft,
  InvalidEntry,
  KeyedRegistry,
  ModelContent,
  ModelRef,
  ModelTool,
  Registry,
  SessionId,
  SessionNotFound,
  StoreError,
  ToolSpec,
  type UserVisibility,
} from "@liminal/sdk";

/** What a section's read found. */
export type SectionRead<A> =
  | { readonly type: "present"; readonly value: A }
  /** The read failed; the saved value stays and nothing is written for the section. */
  | { readonly type: "unavailable" }
  | { readonly type: "removed" };

export interface SectionInput {
  readonly sessionId: SessionId;
  readonly model: ModelRef;
}

/** A prompt section as its plugin writes it. */
export interface PromptSectionDefinition<A> {
  /** Prefixed with the defining plugin's name, such as `instructions/agents`. */
  readonly key: string;
  /** Sections sort by order, then key: base 0, environment 100, instructions 200, skills 300, others 900. */
  readonly order: number;
  /** Saves the value in the log, so a later read can be compared with it. */
  readonly codec: Schema.Codec<A, Schema.Json>;
  readonly read: (input: SectionInput) => Effect.Effect<SectionRead<A>>;
  readonly render: {
    readonly initial: (value: A) => string;
    /** Such as a diff of a changed instruction file against the text the model saw. */
    readonly changed: (before: A, after: A) => string;
    readonly removed?: (before: A) => string;
  };
}

/** A section's current value as JSON, with the text to send for it. */
export type SectionState =
  | {
      readonly type: "present";
      readonly value: Schema.Json;
      readonly initial: string;
      /** The text for a change from the saved `before`, or none when nothing changed. */
      readonly changedFrom: (before: Schema.Json) => Option.Option<string>;
    }
  | { readonly type: "unavailable" }
  | { readonly type: "removed" };

/** A prompt section with its value type erased; build one with `definePromptSection`. */
export interface PromptSection {
  readonly key: string;
  readonly order: number;
  readonly read: (input: SectionInput) => Effect.Effect<SectionState>;
  /** The text for removing the section whose saved value is `before`. */
  readonly removed: (before: Schema.Json) => string;
}

/** Erases a section's value type; a saved value its codec no longer reads renders as new. */
export const definePromptSection = <A>(definition: PromptSectionDefinition<A>): PromptSection => {
  const encode = Schema.encodeSync(definition.codec);
  const decode = Schema.decodeUnknownOption(definition.codec);

  const present = (value: A): SectionState => {
    const json = encode(value);
    const initial = definition.render.initial(value);

    return {
      type: "present",
      value: json,
      initial,
      changedFrom: (before) =>
        Equal.equals(before, json)
          ? Option.none()
          : Option.some(
              Option.match(decode(before), {
                onNone: () => initial,
                onSome: (saved) => definition.render.changed(saved, value),
              }),
            ),
    };
  };

  return {
    key: definition.key,
    order: definition.order,
    read: (input) =>
      Effect.map(definition.read(input), (read) =>
        read.type === "present" ? present(read.value) : read,
      ),
    removed: (before) => {
      const render = definition.render.removed;
      if (render === undefined) return "";

      return Option.match(decode(before), { onNone: () => "", onSome: render });
    },
  };
};

/** The prompt sections by key, newest build first; a plugin registers its sections in its scope. */
export class PromptSections extends KeyedRegistry.Service<PromptSections, PromptSection>()(
  "liminal/context/PromptSections",
) {}

/** Rewrites a session's entries before they become messages, such as cutting at a checkpoint. */
export type ViewStep = (
  sessionId: SessionId,
  entries: ReadonlyArray<Entry>,
) => Effect.Effect<ReadonlyArray<Entry>>;

/** The view steps, run in order. */
export class ViewSteps extends Registry.Service<ViewSteps, ViewStep>()(
  "liminal/context/ViewSteps",
) {}

/**
 * Rewrites the finished request, such as marking where the cached prefix ends. It runs for build
 * and preview alike, after the system entry is saved, so nothing it adds is saved.
 */
export type RequestStep = (
  sessionId: SessionId,
  request: ContextRequest,
) => Effect.Effect<ContextRequest>;

/** The request steps, run in order. */
export class RequestSteps extends Registry.Service<RequestSteps, RequestStep>()(
  "liminal/context/RequestSteps",
) {}

const SectionValue = Schema.Struct({ key: Schema.String, value: Schema.Json, text: Schema.String });

export const SectionChange = Schema.Union([
  Schema.Struct({ type: Schema.Literal("set"), ...SectionValue.fields }),
  Schema.Struct({ type: Schema.Literal("removed"), key: Schema.String, text: Schema.String }),
]);

export type SectionChange = typeof SectionChange.Type;

export const ToolChange = Schema.Struct({
  change: Schema.Literals(["offer", "withdraw"]),
  tool: ToolSpec,
});

export type ToolChange = typeof ToolChange.Type;

/** A full copy of the sections and declared tools, or the changes since the saved ones. */
export const SystemData = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("baseline"),
    sections: Schema.Array(SectionValue),
    tools: Schema.Array(ModelTool),
  }),
  Schema.Struct({
    type: Schema.Literal("update"),
    sections: Schema.Array(SectionChange),
    tools: Schema.Array(ToolChange),
  }),
]);

export type SystemData = typeof SystemData.Type;

/** The system prompt and tools, saved before the model call they first apply to. */
export const SystemEntry = defineEntry({
  kind: "context/system",
  data: SystemData,
  model: true,
  user: "debug",
});

/** A plugin's message to the model, such as a nudge or notice. */
export const MessageEntry = defineEntry({
  kind: "context/message",
  data: Schema.Struct({ label: Schema.String, text: Schema.String }),
  model: true,
  user: "per-entry",
});

/** A context message from the plugin named by `label`, sent to the model as a user message. */
export const contextMessage = (message: {
  readonly label: string;
  readonly text: string;
  readonly user: UserVisibility;
}): EntryDraft<typeof MessageEntry.data.Type> => {
  const model: ReadonlyArray<ModelContent> = [
    { role: "user", parts: [{ type: "text", text: message.text, providerData: {} }] },
  ];

  return draft(MessageEntry, {
    data: { label: message.label, text: message.text },
    model,
    text: message.text,
    user: message.user,
  });
};

/** A model request without the settings `agent-loop` adds: thinking, limits, cache key. */
export const ContextRequest = Schema.Struct({
  model: ModelRef,
  messages: Schema.Array(ModelContent),
  /** The first baseline's tools; later offers and withdrawals are `tool-change` parts. */
  tools: Schema.Array(ModelTool),
});

export type ContextRequest = typeof ContextRequest.Type;

export class Context extends EffectContext.Service<
  Context,
  {
    /** Saves a system entry when sections or tools changed, then returns the next request. */
    readonly build: (
      sessionId: SessionId,
      model: ModelRef,
    ) => Effect.Effect<ContextRequest, SessionNotFound | InvalidEntry | StoreError>;
    /** The request `build` would return, without saving anything. */
    readonly preview: (
      sessionId: SessionId,
      model: ModelRef,
    ) => Effect.Effect<ContextRequest, SessionNotFound | InvalidEntry | StoreError>;
  }
>()("liminal/context/Context") {}

/** The context commands clients call. */
export class ContextRpcs extends RpcGroup.make(
  Rpc.make("context/preview", {
    payload: { session: SessionId, model: ModelRef },
    success: ContextRequest,
    error: Schema.Union([SessionNotFound, InvalidEntry, StoreError]),
  }),
) {}
