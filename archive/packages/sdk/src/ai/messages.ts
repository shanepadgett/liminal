/**
 * `@liminal/sdk/ai/messages`: Anthropic's Messages API through `@effect/ai-anthropic`, one streamed
 * call per request. Needs `@effect/ai-anthropic`, an optional peer of the SDK.
 */

import { AnthropicClient, AnthropicLanguageModel, AnthropicTool } from "@effect/ai-anthropic";
import { Effect, FileSystem, Match, Option, Predicate, Schema, Stream } from "effect";
import { Toolkit } from "effect/ai";
import { HttpClient } from "effect/http";

import {
  type ModelError,
  type ModelRequest,
  ThinkingOff,
  type ThinkingValue,
  type WebQuery,
} from "../core/index.ts";
import { mapJsonBody } from "./body.ts";
import { isFields } from "./data.ts";
import type { ProviderPrompt } from "./provider-prompt.ts";
import { replyOf } from "./reply.ts";
import { hostedSearch } from "./search.ts";

/** What `@effect/ai-anthropic` puts on reasoning parts: the signature, or the redacted thinking. */
const AnthropicData = Schema.Struct({
  anthropic: Schema.Struct({
    info: Schema.Union([
      Schema.Struct({ type: Schema.Literal("thinking"), signature: Schema.String }),
      Schema.Struct({ type: Schema.Literal("redacted_thinking"), redactedData: Schema.String }),
    ]),
  }),
});

/** Anthropic caches the prefix up to each marked block for five minutes. */
const AnthropicPrompt: ProviderPrompt = {
  data: AnthropicData,
  cache: Option.some({ anthropic: { cacheControl: { type: "ephemeral" } } }),
  deferredLoading: "added",
};

/**
 * Request fields as JSON: the package types `output_config.effort` as low, medium or high only, but
 * sends any value unchecked, and the catalog offers xhigh and max for the models that take them.
 */
type Fields = Readonly<Record<string, Schema.Json>>;

/**
 * `On` lets the model choose how much to think; an effort guides that choice; a budget fixes it.
 * The output limit must exceed the budget, so it is sent with it when the request sets one.
 */
const thinkingOf = (value: ThinkingValue, maxOutputTokens: number | undefined) =>
  Match.valueTags(value, {
    Off: (): Fields => ({ thinking: { type: "disabled" } }),
    On: (): Fields => ({ thinking: { type: "adaptive" } }),
    Effort: ({ effort }): Fields => ({ thinking: { type: "adaptive" }, output_config: { effort } }),
    Budget: ({ tokens }): Fields => {
      const thinking = { type: "enabled", budget_tokens: tokens };

      return maxOutputTokens === undefined
        ? { thinking }
        : { thinking, max_tokens: maxOutputTokens };
    },
  });

/** How one provider on a Messages API signs its calls. */
export interface MessagesSigning {
  /** The provider id, which keys the request's provider options. */
  readonly provider: string;
  /** The provider's name in errors. */
  readonly name: string;
  /** The client options for one call: key or headers, address, client changes. */
  readonly options: Effect.Effect<AnthropicClient.Options, ModelError>;
  /** Messages sent before the request's, such as an identity the signing requires. */
  readonly preamble: ModelRequest["messages"];
  /**
   * Whether model `id` loads deferred tools itself: every tool is sent, the deferred ones marked
   * `defer_loading`, and a result that loads tools carries `tool_reference` blocks for them.
   */
  readonly deferredLoading: (id: string) => boolean;
}

/** A request's deferred tools by name, and the tools each result loads, by its call id. */
interface Deferred {
  readonly tools: ReadonlySet<string>;
  readonly loads: ReadonlyMap<string, ReadonlyArray<string>>;
}

const deferredOf = (request: ModelRequest): Deferred => {
  const loads = new Map<string, ReadonlyArray<string>>();

  for (const content of request.messages) {
    for (const part of content.parts) {
      if (part.type === "tool-result" && part.loads !== undefined)
        loads.set(part.callId, part.loads);
    }
  }

  return {
    tools: new Set(request.tools.flatMap((tool) => (tool.deferred === true ? [tool.name] : []))),
    loads,
  };
};

const isList = (value: Schema.Json | undefined): value is ReadonlyArray<Schema.Json> =>
  Array.isArray(value);

/** `value` as an object's fields, or undefined when it is not an object. */
const fieldsOf = (value: Schema.Json): Fields | undefined => (isFields(value) ? value : undefined);

const nameOf = (tool: Schema.Json) => {
  const name = fieldsOf(tool)?.name;

  return Predicate.isString(name) ? name : undefined;
};

/** A result's content as blocks: `@effect/ai-anthropic` sends it as one string. */
const blocksOf = (content: Schema.Json | undefined): ReadonlyArray<Schema.Json> => {
  if (isList(content)) return content;
  if (Predicate.isString(content) && content !== "") return [{ type: "text", text: content }];

  return [];
};

/** A block as sent, and the blocks moved out of it to follow the message's results. */
interface Referenced {
  readonly block: Schema.Json;
  readonly moved: ReadonlyArray<Schema.Json>;
}

/**
 * A `tool_result` block that loads tools holds only a `tool_reference` for each: Anthropic refuses
 * one that mixes them with other content, so its text moves out to follow the results.
 */
const referencing =
  (loads: Deferred["loads"], marked: ReadonlySet<string>) =>
  (block: Schema.Json): Referenced => {
    const fields = fieldsOf(block);
    const id = fields?.tool_use_id;

    if (fields === undefined || fields.type !== "tool_result" || !Predicate.isString(id)) {
      return { block, moved: [] };
    }

    const references = (loads.get(id) ?? []).flatMap((name) =>
      marked.has(name) ? [{ type: "tool_reference", tool_name: name }] : [],
    );

    if (references.length === 0) return { block, moved: [] };

    return { block: { ...fields, content: references }, moved: blocksOf(fields.content) };
  };

/**
 * `body` with the deferred tools marked `defer_loading` and the results that load them referencing
 * them. Anthropic refuses a request whose every tool is deferred, so then it is left as it is.
 */
const deferredBody = (body: Fields, deferred: Deferred): Fields => {
  const tools = isList(body.tools) ? body.tools : [];
  const names = tools.flatMap((tool) => nameOf(tool) ?? []);
  const marked = new Set(names.filter((name) => deferred.tools.has(name)));

  if (marked.size === 0 || marked.size === names.length) return body;

  const mark = (tool: Schema.Json): Schema.Json => {
    const fields = fieldsOf(tool);
    const name = nameOf(tool);

    return fields !== undefined && name !== undefined && marked.has(name)
      ? { ...fields, defer_loading: true }
      : tool;
  };

  /** A message's results come first, so moved text goes after all its blocks. */
  const message = (each: Schema.Json): Schema.Json => {
    const fields = fieldsOf(each);
    const content = fields?.content;
    if (fields === undefined || !isList(content)) return each;

    const referenced = content.map(referencing(deferred.loads, marked));
    const moved = referenced.flatMap((one) => one.moved);

    return moved.length === 0 && referenced.every((one, index) => one.block === content[index])
      ? each
      : { ...fields, content: [...referenced.map((one) => one.block), ...moved] };
  };

  const messages = isList(body.messages) ? body.messages : [];

  return { ...body, tools: tools.map(mark), messages: messages.map(message) };
};

/** `options` with the deferred tools rewrite after its own client changes. */
const withDeferredTools = (
  options: AnthropicClient.Options,
  deferred: Deferred,
): AnthropicClient.Options => {
  const inner = options.transformClient;
  const rewrite = HttpClient.mapRequest(mapJsonBody((body) => deferredBody(body, deferred)));

  return {
    ...options,
    transformClient: (client) => rewrite(inner === undefined ? client : inner(client)),
  };
};

/** Whether `request` goes to a model that loads deferred tools itself. */
const loadsNatively = (signing: MessagesSigning, request: ModelRequest) =>
  signing.deferredLoading(request.model.id);

/** The `effect/ai` language model for `request`, signed as `signing` gives. */
const languageModel = (
  signing: MessagesSigning,
  http: HttpClient.HttpClient,
  request: ModelRequest,
) =>
  Effect.gen(function* () {
    const options = yield* signing.options;
    const deferred = deferredOf(request);

    const client = yield* AnthropicClient.make(
      loadsNatively(signing, request) && deferred.tools.size > 0
        ? withDeferredTools(options, deferred)
        : options,
    ).pipe(Effect.provideService(HttpClient.HttpClient, http));

    return yield* AnthropicLanguageModel.make({
      model: request.model.id,
      config: {
        ...request.providerOptions?.[signing.provider],
        ...thinkingOf(request.thinking, request.maxOutputTokens),
        strictJsonSchema: false,
      },
    }).pipe(Effect.provideService(AnthropicClient.AnthropicClient, client));
  });

/** Streams one Messages call per request, signed by `signing`. */
export const messagesStream =
  (http: HttpClient.HttpClient, fs: FileSystem.FileSystem, signing: MessagesSigning) =>
  (request: ModelRequest) =>
    replyOf(
      signing.name,
      loadsNatively(signing, request)
        ? { ...AnthropicPrompt, deferredLoading: "native" }
        : AnthropicPrompt,
      languageModel(signing, http, request),
      { ...request, messages: [...signing.preamble, ...request.messages] },
    ).pipe(Stream.provideService(FileSystem.FileSystem, fs));

/** At most this many searches per question; each costs the account. */
const searchUses = 3;

/** Searches the web with Anthropic's search tool on model `model`, signed by `signing`. */
export const messagesSearch =
  (
    http: HttpClient.HttpClient,
    fs: FileSystem.FileSystem,
    signing: MessagesSigning,
    model: string,
  ) =>
  (query: WebQuery) =>
    hostedSearch(
      AnthropicPrompt,
      languageModel(signing, http, {
        model: { provider: signing.provider, id: model },
        messages: [],
        tools: [],
        thinking: ThinkingOff.make({}),
      }),
      Toolkit.make(AnthropicTool.WebSearch_20250305({ maxUses: searchUses })),
      { preamble: signing.preamble, query },
    ).pipe(Effect.provideService(FileSystem.FileSystem, fs));
