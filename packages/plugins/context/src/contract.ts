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
  unifiedDiff,
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
  /**
   * Sections sort by order, then key: base 0, tool guidance 50, environment 100 to 110,
   * instructions 200 to 220, skills 300, others 900.
   */
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

/** One file a section holds. */
export const FileText = Schema.Struct({ path: Schema.String, text: Schema.String });
export type FileText = typeof FileText.Type;

/** The files a section holds, most shared first. */
export const FileTexts = Schema.Array(FileText);
export type FileTexts = typeof FileTexts.Type;

const fileTag = ({ path, text }: FileText) => `<file path="${path}">\n${text}\n</file>`;

const removedLine = ({ path }: FileText) => `\`${path}\` was removed; stop following it.`;

/** A changed file as a diff, or its whole new text when the diff is longer. */
const changedFile = (before: FileText, after: FileText) => {
  const patch = unifiedDiff(before.text, after.text);

  return patch.length > after.text.length
    ? fileTag(after)
    : `\`${after.path}\` changed:\n\`\`\`diff\n${patch}\n\`\`\``;
};

/** One file's change from `before`, or none when its text is the same. */
const fileChange = (before: ReadonlyMap<string, FileText>, after: FileText) => {
  const saved = before.get(after.path);
  if (saved === undefined) return [fileTag(after)];

  return saved.text === after.text ? [] : [changedFile(saved, after)];
};

/**
 * The render for a `FileTexts` section: whole files at first, then per path a diff, the whole text
 * of an added file, or a line that a removed file no longer applies.
 */
export const fileTextsRender: PromptSectionDefinition<FileTexts>["render"] = {
  initial: (files) => files.map(fileTag).join("\n\n"),
  changed: (before, after) => {
    const saved = new Map(before.map((file) => [file.path, file]));
    const current = new Set(after.map((file) => file.path));

    return [
      ...after.flatMap((file) => fileChange(saved, file)),
      ...before.flatMap((file) => (current.has(file.path) ? [] : [removedLine(file)])),
    ].join("\n\n");
  },
  removed: (before) => before.map(removedLine).join("\n\n"),
};

/** A section that holds one line per item, such as a rule or a path. */
export const Lines = Schema.Array(Schema.String);
export type Lines = typeof Lines.Type;

/** Titles for a `Lines` section's texts; without `removed`, removed lines are left out. */
export interface LinesTitles {
  readonly initial: string;
  readonly added: string;
  readonly removed?: string;
}

/** The title, then each line as a `- ` bullet, or nothing when there are no lines. */
const titled = (title: string, lines: Lines): ReadonlyArray<string> =>
  lines.length === 0 ? [] : [[title, ...lines.map((line) => `- ${line}`)].join("\n")];

/** The lines of `from` missing from `other`. */
const missing = (from: Lines, other: Lines) => {
  const kept = new Set(other);

  return from.filter((line) => !kept.has(line));
};

/**
 * The render for a `Lines` section: every line as a bullet at first, then only the lines added and
 * removed.
 */
export const linesRender = (titles: LinesTitles): PromptSectionDefinition<Lines>["render"] => ({
  initial: (lines) => titled(titles.initial, lines).join(""),
  changed: (before, after) => {
    const removed =
      titles.removed === undefined ? [] : titled(titles.removed, missing(before, after));

    return [...titled(titles.added, missing(after, before)), ...removed].join("\n\n");
  },
});

/** The prompt sections by key, newest build first; a plugin registers its sections in its scope. */
export class PromptSections extends KeyedRegistry.Service<PromptSections, PromptSection>()(
  "liminal/context/PromptSections",
) {}

/** Lists of tools the model can call; each request declares every list's tools, in order. */
export class ToolSources extends Registry.Service<
  ToolSources,
  Effect.Effect<ReadonlyArray<ModelTool>>
>()("liminal/context/ToolSources") {}

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
