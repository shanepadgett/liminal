/**
 * A request's tool changes, for a model that takes them mid-conversation, and the body rewrite that
 * sends them in a wire's own form: Effect AI knows neither form.
 */
import { Option, Predicate, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

/** A tool as the model is told about it; `input` is a JSON Schema for its params. */
export interface WireTool {
  readonly name: string;
  readonly description: string;
  readonly input: Schema.JsonObject;
}

export interface WireToolChange {
  readonly added: ReadonlyArray<WireTool>;
  readonly removed: ReadonlyArray<string>;
}

/**
 * The tools the request declared and each later change. The body Effect AI builds holds each change
 * as a system message, the only ones after the conversation starts, and the tools after every
 * change; a rewrite that cannot pair them leaves that body as it is.
 */
export interface ToolChanges {
  readonly declared: ReadonlyArray<WireTool>;
  readonly changes: ReadonlyArray<WireToolChange>;
}

export type Fields = Readonly<Record<string, Schema.Json>>;

const decodeFields = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
);

export const isFields = (value: Schema.Json | undefined): value is Fields =>
  Predicate.isObject(value) && !Array.isArray(value);

const isList = (value: Schema.Json | undefined): value is ReadonlyArray<Schema.Json> =>
  Array.isArray(value);

export const listOf = (value: Schema.Json | undefined): ReadonlyArray<Schema.Json> =>
  isList(value) ? value : [];

/** `fields` with `key` set to `value`. */
export const withField = (fields: Fields, key: string, value: Schema.Json): Fields =>
  Object.fromEntries([...Object.entries(fields), [key, value]]);

/** The tools a change withdraws and does not define again. */
export const withdrawnOf = ({ added, removed }: WireToolChange) =>
  removed.filter((name) => !added.some((tool) => tool.name === name));

/** `request` with its JSON object body rewritten by `change`; any other body is left as it is. */
const mapJsonBody =
  (change: (body: Fields) => Fields) =>
  (request: HttpClientRequest.HttpClientRequest): HttpClientRequest.HttpClientRequest => {
    if (!Predicate.isTagged(request.body, "Uint8Array")) return request;

    return Option.match(decodeFields(new TextDecoder().decode(request.body.body)), {
      onNone: () => request,
      onSome: (body) => HttpClientRequest.bodyJsonUnsafe(request, change(body)),
    });
  };

/** How a wire sends tool changes: a change to each request's headers and one to its body. */
export interface WireForm {
  readonly request: (
    request: HttpClientRequest.HttpClientRequest,
  ) => HttpClientRequest.HttpClientRequest;
  readonly body: (body: Fields) => Fields;
}

/**
 * Client options whose client sends `toolChanges` in the wire's form, before the options' own
 * client changes; the options as they are when there are none.
 */
export const withToolChanges = <
  Options extends {
    readonly transformClient?:
      | ((client: HttpClient.HttpClient) => HttpClient.HttpClient)
      | undefined;
  },
>(
  options: Options,
  toolChanges: ToolChanges | undefined,
  formOf: (toolChanges: ToolChanges) => WireForm,
): Options => {
  if (toolChanges === undefined) return options;

  const form = formOf(toolChanges);
  const inner = options.transformClient;

  const outer = (client: HttpClient.HttpClient) =>
    HttpClient.mapRequest(client, (request) => mapJsonBody(form.body)(form.request(request)));

  return {
    ...options,
    transformClient: (client: HttpClient.HttpClient) =>
      outer(inner === undefined ? client : inner(client)),
  };
};
